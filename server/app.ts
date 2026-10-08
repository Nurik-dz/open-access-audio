import express, { NextFunction, Request, RequestHandler, Response } from "express";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import type { ServerConfig } from "./config";
import { createEngine, probeEngine, type Engine, type EngineStatus } from "./engine";
import { HttpError } from "./errors";
import { createRateLimiter } from "./rateLimit";
import {
  HERTZ_PATTERN,
  PERCENT_PATTERN,
  VOICE_PATTERN,
  clampInt,
  clampNumber,
  cleanToken,
  decodeDataUrl,
  matchOrDefault,
  pickOne,
  requireText,
} from "./validators";

export interface AppDeps {
  config: ServerConfig;
  /** Injectable for tests; defaults to the real Python engine. */
  engine?: Engine;
}

const DEFAULT_VOICE = "en-US-AndrewMultilingualNeural";
const MAX_TTS_CHARS = 5000; // matches the limit shown in the UI
const MAX_PROMPT_CHARS = 1000;
const VOICES_TTL_MS = 60 * 60 * 1000;
const HEALTH_TTL_MS = 30 * 1000;

const toDataUrl = (mime: string, buffer: Buffer) => `data:${mime};base64,${buffer.toString("base64")}`;

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

export function createApp({ config, engine = createEngine(config) }: AppDeps) {
  const app = express();
  const maxBytes = config.maxBodyMb * 1024 * 1024;

  fs.mkdirSync(config.tempDir, { recursive: true, mode: 0o700 });

  // ---------------------------------------------------------------- helpers

  const tempPath = (prefix: string, suffix: string) => path.join(config.tempDir, `${prefix}_${randomUUID()}${suffix}`);

  function safeDelete(filePath: string | undefined) {
    if (!filePath) return;
    try {
      fs.rmSync(filePath, { force: true });
    } catch (err) {
      console.error(`[Cleanup Error] Failed to delete ${filePath}:`, err);
    }
  }

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, config.tempDir),
      filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `upload_${randomUUID()}${/^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : ".wav"}`);
      },
    }),
    limits: { fileSize: maxBytes },
  });

  /** Run `fn`, then delete the uploaded file and every path it registered via `track`. */
  async function withCleanup<T>(req: Request, fn: (track: (p: string) => string) => Promise<T>): Promise<T> {
    const files: string[] = req.file?.path ? [req.file.path] : [];
    try {
      return await fn((p) => {
        files.push(p);
        return p;
      });
    } finally {
      files.forEach(safeDelete);
    }
  }

  /** Audio arrives either as a multipart upload or as base64 in a JSON body. */
  function resolveAudioInput(req: Request, track: (p: string) => string, base64Field: string, label: string): string {
    if (req.file?.path) return req.file.path;
    const buffer = decodeDataUrl(req.body?.[base64Field], maxBytes, label);
    const filePath = track(tempPath("upload_b64", ".wav"));
    fs.writeFileSync(filePath, buffer, { mode: 0o600 });
    return filePath;
  }

  /**
   * Run an engine action that writes its result to `output_path`, and return the output
   * bytes. The payload file may hold a Hugging Face token, so it is private and always
   * removed.
   */
  async function runMediaJob(action: string, prefix: string, ext: string, payload: Record<string, unknown>) {
    const payloadPath = tempPath(prefix, "_req.json");
    const outputPath = tempPath(prefix, `_out${ext}`);
    try {
      fs.writeFileSync(payloadPath, JSON.stringify({ ...payload, output_path: outputPath }), { mode: 0o600 });
      const result = await engine.run([action, payloadPath]);
      if (!result.success || !fs.existsSync(outputPath)) {
        throw new Error(result.error || `The ${action} engine produced no output.`);
      }
      const buffer = await fs.promises.readFile(outputPath);
      return { result, buffer };
    } finally {
      safeDelete(payloadPath);
      safeDelete(outputPath);
    }
  }

  const tokenFrom = (value: unknown) => cleanToken(value) || config.hfToken;

  // ------------------------------------------------------------- middleware

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  app.use(express.json({ limit: `${config.maxBodyMb}mb` }));
  app.use(express.urlencoded({ extended: true, limit: `${config.maxBodyMb}mb` }));
  // Only generation endpoints are throttled; GET /api/health and /api/voices stay cheap.
  app.post("/api/*", createRateLimiter(config.rateLimitPerMinute));

  // ----------------------------------------------------------------- health

  let healthCache: { at: number; status: EngineStatus } | null = null;

  async function getEngineStatus(): Promise<EngineStatus> {
    if (healthCache && Date.now() - healthCache.at < HEALTH_TTL_MS) return healthCache.status;
    const status = await probeEngine(engine);
    healthCache = { at: Date.now(), status };
    return status;
  }

  app.get(
    "/api/health",
    wrap(async (_req, res) => {
      const engineStatus = await getEngineStatus();
      res.json({
        status: engineStatus.available && engineStatus.warnings.length === 0 ? "ok" : "degraded",
        service: "ElevenOpen Studio",
        timestamp: new Date().toISOString(),
        engine: engineStatus,
      });
    })
  );

  // ----------------------------------------------------------------- voices

  let voicesCache: { at: number; voices: unknown[] } | null = null;

  app.get(
    "/api/voices",
    wrap(async (_req, res) => {
      if (voicesCache && Date.now() - voicesCache.at < VOICES_TTL_MS) {
        return res.json({ success: true, voices: voicesCache.voices, cached: true });
      }
      const result = await engine.run(["voices"]);
      const voices: unknown[] = result.voices || [];
      // Don't cache an empty list: it usually means the network was down.
      if (voices.length > 0) voicesCache = { at: Date.now(), voices };
      res.json({ success: true, voices });
    })
  );

  // -------------------------------------------------------------------- tts

  app.post(
    "/api/tts",
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const payload = {
        text: requireText(body.text, MAX_TTS_CHARS, "Text"),
        voice: matchOrDefault(body.voice, VOICE_PATTERN, DEFAULT_VOICE, "voice"),
        rate: matchOrDefault(body.rate, PERCENT_PATTERN, "+0%", "rate"),
        pitch: matchOrDefault(body.pitch, HERTZ_PATTERN, "+0Hz", "pitch"),
        volume: matchOrDefault(body.volume, PERCENT_PATTERN, "+0%", "volume"),
      };

      const { buffer } = await runMediaJob("tts", "tts", ".mp3", payload);

      if (body.format === "audio") {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Disposition", `attachment; filename="synthesis_${Date.now()}.mp3"`);
        return res.send(buffer);
      }

      const dataUrl = toDataUrl("audio/mp3", buffer);
      res.json({
        success: true,
        audioUrl: dataUrl,
        audioBase64: dataUrl,
        format: "mp3",
        voice: payload.voice,
        sizeBytes: buffer.length,
      });
    })
  );

  // -------------------------------------------------------------------- stt

  app.post(
    "/api/stt",
    upload.single("audio"),
    wrap(async (req, res) => {
      await withCleanup(req, async (track) => {
        const language = matchOrDefault(req.body?.language, /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, "en-US", "language");
        const inputPath = resolveAudioInput(req, track, "audioBase64", "Audio file or audioBase64");
        const result = await engine.run(["stt", inputPath, language]);
        if (!result.success) throw new Error(result.error || "STT transcription failed.");
        res.json({ success: true, text: result.text || "", language });
      });
    })
  );

  // ---------------------------------------------------------------- analyze

  app.post(
    "/api/analyze",
    upload.single("audio"),
    wrap(async (req, res) => {
      await withCleanup(req, async (track) => {
        const inputPath = resolveAudioInput(req, track, "audioBase64", "Audio file or audioBase64");
        const result = await engine.run(["analyze", inputPath]);
        if (!result.success) throw new Error(result.error || "Acoustic analysis failed.");
        res.json({ success: true, profile: result.profile });
      });
    })
  );

  // ------------------------------------------------------------------ clone

  app.post(
    "/api/clone",
    upload.single("ref_audio"),
    wrap(async (req, res) => {
      const body = req.body ?? {};
      await withCleanup(req, async (track) => {
        const text = requireText(body.text, MAX_TTS_CHARS, "Target text");
        const refAudioPath = resolveAudioInput(req, track, "refAudioBase64", "Reference audio");

        const { result, buffer } = await runMediaJob("clone", "clone", ".wav", {
          ref_audio_path: refAudioPath,
          text,
          ref_text: typeof body.ref_text === "string" ? body.ref_text.trim().slice(0, 1000) : "",
          hf_token: tokenFrom(body.hf_token),
          pitch_adj: clampInt(body.pitch_adj, 0, -100, 100),
          timbre_adj: clampNumber(body.timbre_adj, 0, -12, 12),
        });

        const dataUrl = toDataUrl("audio/wav", buffer);
        res.json({
          success: true,
          audioUrl: dataUrl,
          audioBase64: dataUrl,
          format: "wav",
          refText: result.ref_text || body.ref_text || "",
          profile: result.profile || null,
          sizeBytes: buffer.length,
        });
      });
    })
  );

  // -------------------------------------------------------- sfx / ambient

  /** Shared by /api/sfx and /api/ambient: both return WAV audio from the same engine contract. */
  function audioGenerationRoute(action: "sfx" | "ambient", buildPayload: (body: any) => Record<string, unknown>) {
    return wrap(async (req, res) => {
      const body = req.body ?? {};
      const payload = buildPayload(body);
      const { result, buffer } = await runMediaJob(action, action, ".wav", payload);

      if (body.format === "audio" || req.headers.accept?.includes("audio/")) {
        res.setHeader("Content-Type", "audio/wav");
        res.setHeader("Content-Disposition", `attachment; filename="${action}_${Date.now()}.wav"`);
        return res.send(buffer);
      }

      const dataUrl = toDataUrl("audio/wav", buffer);
      res.json({
        success: true,
        audioUrl: dataUrl,
        audioBase64: dataUrl,
        format: "wav",
        prompt: payload.prompt,
        // "procedural" means the keyword-driven offline synthesizer ran, not a neural model.
        method: result.method,
        remoteError: result.remote_error,
        sizeBytes: buffer.length,
      });
    });
  }

  app.post(
    "/api/sfx",
    audioGenerationRoute("sfx", (body) => ({
      prompt: requireText(body.prompt, MAX_PROMPT_CHARS, "Prompt"),
      hf_token: tokenFrom(body.hf_token),
      duration: clampNumber(body.duration, 5, 0.5, 30),
      guidance_scale: clampNumber(body.guidance_scale, 3.5, 1, 10),
    }))
  );

  app.post(
    "/api/ambient",
    audioGenerationRoute("ambient", (body) => ({
      prompt: requireText(body.prompt, MAX_PROMPT_CHARS, "Prompt"),
      hf_token: tokenFrom(body.hf_token),
      seconds_total: clampNumber(body.seconds_total, 10, 1, 47),
      steps: clampInt(body.steps, 100, 10, 200),
    }))
  );

  // ------------------------------------------------------------------ image

  app.post(
    "/api/image",
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const payload = {
        prompt: requireText(body.prompt, MAX_PROMPT_CHARS, "Prompt"),
        width: clampInt(body.width, 1080, 64, 2048),
        height: clampInt(body.height, 1920, 64, 2048),
      };

      const { buffer } = await runMediaJob("image", "img", ".jpg", payload);

      if (body.format === "image" || req.headers.accept?.includes("image/jpeg") || req.query.raw === "true") {
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Disposition", `inline; filename="visual_${Date.now()}.jpg"`);
        return res.send(buffer);
      }

      const dataUrl = toDataUrl("image/jpeg", buffer);
      res.json({
        success: true,
        imageUrl: dataUrl,
        imageBase64: dataUrl,
        format: "jpeg",
        width: payload.width,
        height: payload.height,
        prompt: payload.prompt,
        sizeBytes: buffer.length,
      });
    })
  );

  // ------------------------------------------------------------------ video

  app.post(
    "/api/video",
    wrap(async (req, res) => {
      const body = req.body ?? {};
      const payload = {
        prompt: requireText(body.prompt, MAX_PROMPT_CHARS, "Prompt"),
        hf_token: tokenFrom(body.hf_token),
        negative_prompt:
          typeof body.negative_prompt === "string" && body.negative_prompt.trim()
            ? body.negative_prompt.trim().slice(0, MAX_PROMPT_CHARS)
            : "low quality, blurry, distorted, jitter, artifact",
        seconds: clampNumber(body.seconds, 4, 2, 10),
        motion_style: matchOrDefault(body.motion_style, /^[A-Za-z-]{1,30}$/, "zoom", "motion style"),
        base_model: pickOne(body.base_model, ["epiCRealism", "ToonYou"] as const, "epiCRealism"),
        steps: body.steps === 8 || body.steps === "8" ? 8 : 4,
        resolution: pickOne(body.resolution, ["720p", "1080p"] as const, "720p"),
      };

      const { result, buffer } = await runMediaJob("video", "vid", ".mp4", payload);

      if (body.format === "video" || req.headers.accept?.includes("video/mp4") || req.query.raw === "true") {
        res.setHeader("Content-Type", "video/mp4");
        res.setHeader("Content-Disposition", `inline; filename="video_${Date.now()}.mp4"`);
        return res.send(buffer);
      }

      const dataUrl = toDataUrl("video/mp4", buffer);
      res.json({
        success: true,
        videoUrl: dataUrl,
        videoBase64: dataUrl,
        format: "mp4",
        durationSec: payload.seconds,
        prompt: payload.prompt,
        // Report what actually ran. "keyframe-morph" is a cross-dissolve, not neural video.
        model: result.model,
        method: result.method,
        remoteError: result.remote_error,
        motion: payload.motion_style,
        fps: 24,
        resolution: payload.resolution,
        sizeBytes: buffer.length,
      });
    })
  );

  // ------------------------------------------------------- 404s and errors

  app.use("/api", (_req, res) => {
    res.status(404).json({ success: false, error: "Not found." });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    let status = 500;
    let message: string = err?.message || "Internal server error.";

    if (err instanceof HttpError) {
      status = err.status;
    } else if (err instanceof multer.MulterError) {
      status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      if (err.code === "LIMIT_FILE_SIZE") message = `File is too large (limit ${config.maxBodyMb} MB).`;
    } else if (err?.type === "entity.too.large") {
      status = 413;
      message = `Request body is too large (limit ${config.maxBodyMb} MB).`;
    } else if (err?.type === "entity.parse.failed") {
      status = 400;
      message = "Request body is not valid JSON.";
    }

    if (status >= 500) console.error(`[${_req.method} ${_req.path}]`, err);
    res.status(status).json({ success: false, error: message });
  });

  return app;
}

/**
 * Delete scratch files that a crashed or aborted request left behind. Call once from the
 * server entry point (not from createApp, so tests don't leave timers running).
 */
export function startTempSweeper(tempDir: string, maxAgeMs = 60 * 60 * 1000, everyMs = 30 * 60 * 1000) {
  const sweep = () => {
    let names: string[];
    try {
      names = fs.readdirSync(tempDir);
    } catch {
      return;
    }
    const cutoff = Date.now() - maxAgeMs;
    for (const name of names) {
      const full = path.join(tempDir, name);
      try {
        const stat = fs.statSync(full);
        if (stat.isFile() && stat.mtimeMs < cutoff) fs.rmSync(full, { force: true });
      } catch {
        /* file vanished or is in use; ignore */
      }
    }
  };
  sweep();
  const timer = setInterval(sweep, everyMs);
  timer.unref();
  return timer;
}
