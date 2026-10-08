import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import multer from "multer";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Temp upload directory for streaming/processing
const TEMP_DIR = path.join(process.cwd(), "temp_audio");
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Multer for multipart audio uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TEMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".wav";
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// JSON and URL-encoded body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Helper to safely clean up files
function safeDelete(filePath: string | undefined) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error(`[Cleanup Error] Failed to delete ${filePath}:`, err);
  }
}

// Helper to run Python engine script
function runPythonEngine(args: string[]): Promise<any> {
  return new Promise((resolve, reject) => {
    const pyProcess = spawn("python3", ["audio_engine.py", ...args], {
      cwd: process.cwd(),
    });

    let stdoutData = "";
    let stderrData = "";

    pyProcess.stdout.on("data", (data) => {
      stdoutData += data.toString();
    });

    pyProcess.stderr.on("data", (data) => {
      stderrData += data.toString();
    });

    pyProcess.on("close", (code) => {
      // Find the last valid JSON line or block in stdoutData
      const lines = stdoutData.trim().split("\n");
      let parsedResult: any = null;

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i].trim();
        if (line.startsWith("{") && line.endsWith("}")) {
          try {
            parsedResult = JSON.parse(line);
            break;
          } catch {}
        }
      }

      if (!parsedResult) {
        try {
          parsedResult = JSON.parse(stdoutData.trim());
        } catch {}
      }

      if (code !== 0) {
        if (parsedResult && parsedResult.error) {
          return reject(new Error(parsedResult.error));
        }
        return reject(
          new Error(
            stderrData.trim() ||
            (parsedResult ? JSON.stringify(parsedResult) : stdoutData.trim()) ||
            `Python process exited with code ${code}`
          )
        );
      }

      if (parsedResult) {
        resolve(parsedResult);
      } else {
        reject(new Error(`Failed to parse engine output: ${stdoutData}\n${stderrData}`));
      }
    });
  });
}

// ---------------- API ROUTES ----------------

// Health check
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "Open-Access Audio Suite",
    timestamp: new Date().toISOString(),
  });
});

// GET /api/voices - List all available Microsoft Edge TTS Voices
app.get("/api/voices", async (_req, res) => {
  try {
    const result = await runPythonEngine(["voices"]);
    res.json({ success: true, voices: result.voices || [] });
  } catch (error: any) {
    console.error("[Voices Error]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tts - Text-to-Speech via edge-tts CLI
app.post("/api/tts", async (req, res) => {
  const { text, voice, rate, pitch, volume, format } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ success: false, error: "Text is required for TTS synthesis." });
  }

  const payloadId = `tts_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.mp3`);

  try {
    const payload = {
      text: text.trim(),
      voice: voice || "en-US-AndrewMultilingualNeural",
      rate: rate || "+0%",
      pitch: pitch || "+0Hz",
      volume: volume || "+0%",
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["tts", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Failed to generate audio output.");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    const base64Audio = audioBuffer.toString("base64");
    const dataUrl = `data:audio/mp3;base64,${base64Audio}`;

    // Clean up temporary files immediately
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);

    if (format === "audio") {
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", `attachment; filename="synthesis_${Date.now()}.mp3"`);
      return res.send(audioBuffer);
    }

    res.json({
      success: true,
      audioUrl: dataUrl,
      audioBase64: dataUrl,
      format: "mp3",
      voice: payload.voice,
      sizeBytes: audioBuffer.length,
    });
  } catch (error: any) {
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[TTS Error]:", error);
    res.status(500).json({ success: false, error: error.message || "TTS generation failed." });
  }
});

// POST /api/stt - Speech-to-Text via ffmpeg + Google Web Speech endpoint
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  let uploadedPath: string | undefined = req.file?.path;
  const language = req.body.language || "en-US";

  try {
    // Handle base64 audio if provided in JSON body
    if (!uploadedPath && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      uploadedPath = path.join(TEMP_DIR, `upload_b64_${Date.now()}.wav`);
      fs.writeFileSync(uploadedPath, buffer);
    }

    if (!uploadedPath || !fs.existsSync(uploadedPath)) {
      return res.status(400).json({ success: false, error: "Audio file or audioBase64 is required for transcription." });
    }

    const result = await runPythonEngine(["stt", uploadedPath, language]);

    // Cleanup input upload file immediately
    safeDelete(uploadedPath);

    if (!result.success) {
      throw new Error(result.error || "STT transcription failed.");
    }

    res.json({
      success: true,
      text: result.text || "",
      language,
    });
  } catch (error: any) {
    safeDelete(uploadedPath);
    console.error("[STT Error]:", error);
    res.status(500).json({ success: false, error: error.message || "STT transcription failed." });
  }
});

// POST /api/analyze - Voice Acoustic Analysis & Speech Recognition
app.post("/api/analyze", upload.single("audio"), async (req, res) => {
  let uploadedPath: string | undefined = req.file?.path;

  try {
    if (!uploadedPath && req.body.audioBase64) {
      const base64Data = req.body.audioBase64.replace(/^data:audio\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      uploadedPath = path.join(TEMP_DIR, `analyze_${Date.now()}.wav`);
      fs.writeFileSync(uploadedPath, buffer);
    }

    if (!uploadedPath || !fs.existsSync(uploadedPath)) {
      return res.status(400).json({ success: false, error: "Audio file or audioBase64 is required for analysis." });
    }

    const result = await runPythonEngine(["analyze", uploadedPath]);
    safeDelete(uploadedPath);

    if (!result.success) {
      throw new Error(result.error || "Acoustic analysis failed.");
    }

    res.json({
      success: true,
      profile: result.profile,
    });
  } catch (error: any) {
    safeDelete(uploadedPath);
    console.error("[Analyze Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Acoustic analysis failed." });
  }
});

// POST /api/clone - Voice Cloning via Acoustic Matching & Zero-Shot Neural Model
app.post("/api/clone", upload.single("ref_audio"), async (req, res) => {
  let uploadedPath: string | undefined = req.file?.path;
  const text = req.body.text;
  const refText = req.body.ref_text || "";
  const hfToken = req.body.hf_token || "";
  const pitchAdj = parseInt(req.body.pitch_adj || "0", 10) || 0;
  const timbreAdj = parseFloat(req.body.timbre_adj || "0") || 0.0;

  if (!text || typeof text !== "string" || !text.trim()) {
    safeDelete(uploadedPath);
    return res.status(400).json({ success: false, error: "Target text is required for voice cloning." });
  }

  // Handle base64 ref audio if provided in JSON
  if (!uploadedPath && req.body.refAudioBase64) {
    const base64Data = req.body.refAudioBase64.replace(/^data:audio\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    uploadedPath = path.join(TEMP_DIR, `clone_ref_${Date.now()}.wav`);
    fs.writeFileSync(uploadedPath, buffer);
  }

  if (!uploadedPath || !fs.existsSync(uploadedPath)) {
    return res.status(400).json({ success: false, error: "Reference audio file is required for voice cloning." });
  }

  const payloadId = `clone_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.wav`);

  try {
    const payload = {
      ref_audio_path: uploadedPath,
      text: text.trim(),
      ref_text: refText.trim(),
      hf_token: hfToken.trim(),
      pitch_adj: pitchAdj,
      timbre_adj: timbreAdj,
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["clone", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Voice cloning failed.");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    const base64Audio = audioBuffer.toString("base64");
    const dataUrl = `data:audio/wav;base64,${base64Audio}`;

    // Clean up all temporary files immediately
    safeDelete(uploadedPath);
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);

    res.json({
      success: true,
      audioUrl: dataUrl,
      audioBase64: dataUrl,
      format: "wav",
      refText: result.ref_text || refText,
      profile: result.profile || null,
      sizeBytes: audioBuffer.length,
    });
  } catch (error: any) {
    safeDelete(uploadedPath);
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[Clone Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Voice cloning failed." });
  }
});

// POST /api/sfx - Sound Effects generation via haoheliu/audioldm2-text2audio-text2music
app.post("/api/sfx", async (req, res) => {
  const { prompt, hf_token, duration, guidance_scale, format } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, error: "Prompt is required for sound effect synthesis." });
  }

  const payloadId = `sfx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.wav`);

  try {
    const payload = {
      prompt: prompt.trim(),
      hf_token: hf_token ? hf_token.trim() : "",
      duration: duration ? parseFloat(duration) : 5.0,
      guidance_scale: guidance_scale ? parseFloat(guidance_scale) : 3.5,
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["sfx", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Failed to generate sound effect output.");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    const base64Audio = audioBuffer.toString("base64");
    const dataUrl = `data:audio/wav;base64,${base64Audio}`;

    // Clean up temporary files
    safeDelete(payloadJsonPath);

    if (format === "audio" || req.headers.accept?.includes("audio/")) {
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="sfx_${Date.now()}.wav"`);
      res.send(audioBuffer);
      safeDelete(outputPath);
      return;
    }

    safeDelete(outputPath);

    res.json({
      success: true,
      audioUrl: dataUrl,
      audioBase64: dataUrl,
      format: "wav",
      prompt: payload.prompt,
      sizeBytes: audioBuffer.length,
    });
  } catch (error: any) {
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[SFX Error]:", error);
    res.status(500).json({ success: false, error: error.message || "SFX synthesis failed." });
  }
});

// POST /api/ambient - Ambient environmental soundscapes via stabilityai/stable-audio-open-1.0
app.post("/api/ambient", async (req, res) => {
  const { prompt, hf_token, seconds_total, steps, format } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, error: "Prompt is required for ambient soundscape synthesis." });
  }

  const payloadId = `ambient_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.wav`);

  try {
    const payload = {
      prompt: prompt.trim(),
      hf_token: hf_token ? hf_token.trim() : "",
      seconds_total: seconds_total ? parseFloat(seconds_total) : 10.0,
      steps: steps ? parseInt(steps, 10) : 100,
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["ambient", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Failed to generate ambient audio output.");
    }

    const audioBuffer = fs.readFileSync(outputPath);
    const base64Audio = audioBuffer.toString("base64");
    const dataUrl = `data:audio/wav;base64,${base64Audio}`;

    safeDelete(payloadJsonPath);

    if (format === "audio" || req.headers.accept?.includes("audio/")) {
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Disposition", `attachment; filename="ambient_${Date.now()}.wav"`);
      res.send(audioBuffer);
      safeDelete(outputPath);
      return;
    }

    safeDelete(outputPath);

    res.json({
      success: true,
      audioUrl: dataUrl,
      audioBase64: dataUrl,
      format: "wav",
      prompt: payload.prompt,
      sizeBytes: audioBuffer.length,
    });
  } catch (error: any) {
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[Ambient Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Ambient audio synthesis failed." });
  }
});

// POST /api/image - Open-Access Image Generation via Pollinations API (1080x1920 vertical canvas)
app.post("/api/image", async (req, res) => {
  const { prompt, width = 1080, height = 1920, format } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, error: "Prompt is required for image generation." });
  }

  const payloadId = `img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.jpg`);

  try {
    const payload = {
      prompt: prompt.trim(),
      width: parseInt(width) || 1080,
      height: parseInt(height) || 1920,
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["image", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Failed to generate visual asset.");
    }

    const imageBuffer = fs.readFileSync(outputPath);
    const base64Image = imageBuffer.toString("base64");
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    safeDelete(payloadJsonPath);

    // If client requested raw binary image stream or Accept header contains image/*
    if (format === "image" || req.headers.accept?.includes("image/jpeg") || req.query.raw === "true") {
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Content-Disposition", `inline; filename="visual_${Date.now()}.jpg"`);
      res.send(imageBuffer);
      safeDelete(outputPath);
      return;
    }

    safeDelete(outputPath);

    res.json({
      success: true,
      imageUrl: dataUrl,
      imageBase64: dataUrl,
      format: "jpeg",
      width: payload.width,
      height: payload.height,
      prompt: payload.prompt,
      sizeBytes: imageBuffer.length,
    });
  } catch (error: any) {
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[Image Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Image generation failed." });
  }
});

// POST /api/video - Neural Diffusion Text-to-Video Generation (ByteDance AnimateDiff-Lightning & ZeroGPU Spaces)
app.post("/api/video", async (req, res) => {
  const {
    prompt,
    hf_token,
    negative_prompt,
    seconds = 4.0,
    format,
    motion_style = "zoom",
    base_model = "epiCRealism",
    steps = 4,
    resolution = "720p"
  } = req.body;

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ success: false, error: "Prompt is required for video generation." });
  }

  const payloadId = `vid_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const payloadJsonPath = path.join(TEMP_DIR, `${payloadId}_req.json`);
  const outputPath = path.join(TEMP_DIR, `${payloadId}_out.mp4`);

  try {
    const payload = {
      prompt: prompt.trim(),
      hf_token: hf_token || process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN || "",
      negative_prompt: negative_prompt || "low quality, blurry, distorted, jitter, artifact",
      seconds: parseFloat(seconds) || 4.0,
      motion_style: motion_style || "zoom",
      base_model: base_model || "epiCRealism",
      steps: parseInt(steps) || 4,
      resolution: resolution || "720p",
      output_path: outputPath,
    };

    fs.writeFileSync(payloadJsonPath, JSON.stringify(payload));

    const result = await runPythonEngine(["video", payloadJsonPath]);

    if (!result.success || !fs.existsSync(outputPath)) {
      throw new Error(result.error || "Failed to render video asset.");
    }

    const videoBuffer = fs.readFileSync(outputPath);
    const base64Video = videoBuffer.toString("base64");
    const dataUrl = `data:video/mp4;base64,${base64Video}`;

    safeDelete(payloadJsonPath);

    // If client requested raw binary video stream or Accept header contains video/mp4
    if (format === "video" || req.headers.accept?.includes("video/mp4") || req.query.raw === "true") {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Content-Disposition", `inline; filename="video_${Date.now()}.mp4"`);
      res.send(videoBuffer);
      safeDelete(outputPath);
      return;
    }

    safeDelete(outputPath);

    res.json({
      success: true,
      videoUrl: dataUrl,
      videoBase64: dataUrl,
      format: "mp4",
      durationSec: payload.seconds,
      prompt: payload.prompt,
      model: payload.base_model === "ToonYou" ? "AnimateDiff (ToonYou Anime)" : "AnimateDiff-Lightning (epiCRealism Photorealistic)",
      motion: payload.motion_style,
      fps: 24,
      resolution: payload.resolution,
      sizeBytes: videoBuffer.length,
    });
  } catch (error: any) {
    safeDelete(payloadJsonPath);
    safeDelete(outputPath);
    console.error("[Video Error]:", error);
    res.status(500).json({ success: false, error: error.message || "Video generation failed." });
  }
});

// Vite / Static setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Open-Access Audio Suite server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
