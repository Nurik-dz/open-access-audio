import { spawn } from "child_process";
import path from "path";
import type { ServerConfig } from "./config";
import { HttpError } from "./errors";

export interface EngineRunOptions {
  /** Skip the concurrency queue (used for cheap diagnostics such as the health check). */
  priority?: boolean;
}

export interface Engine {
  run(args: string[], options?: EngineRunOptions): Promise<any>;
}

type EngineConfig = Pick<ServerConfig, "python" | "engineScript" | "maxConcurrentJobs" | "engineTimeoutMs">;

const MAX_QUEUED_JOBS = 20;
const MAX_CAPTURED_BYTES = 1024 * 1024;

/**
 * The engine prints exactly one JSON object on stdout, but libraries occasionally write
 * extra lines first. Prefer the last line that parses as a JSON object; fall back to the
 * whole output.
 */
export function parseEngineOutput(stdout: string): any | null {
  const lines = stdout.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith("{") && line.endsWith("}")) {
      try {
        return JSON.parse(line);
      } catch {
        /* keep scanning */
      }
    }
  }
  try {
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

/** Runs `audio_engine.py` as a child process with a concurrency cap and a hard timeout. */
export function createEngine(config: EngineConfig): Engine {
  let active = 0;
  const waiting: Array<() => void> = [];

  async function acquire() {
    if (active < config.maxConcurrentJobs) {
      active++;
      return;
    }
    if (waiting.length >= MAX_QUEUED_JOBS) {
      throw new HttpError(503, "The server is busy. Please try again shortly.");
    }
    // The releasing job hands its slot straight to us, so `active` is not incremented here.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  function release() {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }

  function execute(args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const child = spawn(config.python, [config.engineScript, ...args], {
        cwd: path.dirname(config.engineScript),
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(() => reject(new Error(`Audio engine timed out after ${Math.round(config.engineTimeoutMs / 1000)}s.`)));
      }, config.engineTimeoutMs);

      child.stdout.on("data", (data) => {
        if (stdout.length < MAX_CAPTURED_BYTES) stdout += data.toString();
      });
      child.stderr.on("data", (data) => {
        if (stderr.length < MAX_CAPTURED_BYTES) stderr += data.toString();
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        finish(() =>
          reject(
            err.code === "ENOENT"
              ? new Error(`Python interpreter "${config.python}" was not found. Install Python 3.10+ or set PYTHON in .env.`)
              : err
          )
        );
      });

      child.on("close", (code) => {
        finish(() => {
          const parsed = parseEngineOutput(stdout);

          if (code !== 0) {
            if (parsed && parsed.error) return reject(new Error(parsed.error));
            const detail = stderr.trim().split("\n").slice(-6).join("\n");
            return reject(new Error(detail || `Audio engine exited with code ${code}.`));
          }
          if (!parsed) {
            return reject(new Error(`Failed to parse engine output: ${stdout.slice(0, 300)}`));
          }
          resolve(parsed);
        });
      });
    });
  }

  return {
    async run(args, options = {}) {
      if (options.priority) return execute(args);
      await acquire();
      try {
        return await execute(args);
      } finally {
        release();
      }
    },
  };
}

export interface EngineStatus {
  available: boolean;
  error?: string;
  ffmpeg?: boolean;
  python?: string;
  modules?: Record<string, boolean>;
  /** Problems that break a feature and that the user can fix. */
  warnings: string[];
  /** Optional extras that are missing; local fallbacks still work. */
  notices: string[];
}

const REQUIRED_MODULES = ["numpy", "scipy", "requests", "edge_tts"];

/** Ask the engine which runtime dependencies are present. Never throws. */
export async function probeEngine(engine: Engine): Promise<EngineStatus> {
  try {
    const result = await engine.run(["check"], { priority: true });
    const modules: Record<string, boolean> = result.modules || {};
    const warnings: string[] = [];

    if (!result.ffmpeg) warnings.push("FFmpeg was not found on PATH (needed for audio and video processing).");
    const missing = REQUIRED_MODULES.filter((m) => !modules[m]);
    if (missing.length) warnings.push(`Missing Python packages: ${missing.join(", ")}. Run: pip install -r requirements.txt`);
    if (!modules.speech_recognition) warnings.push("SpeechRecognition is not installed; Speech to Text is unavailable.");
    const notices: string[] = [];
    if (!modules.gradio_client) notices.push("gradio_client is not installed; remote neural models (video, cloning, SFX) are unavailable, local fallbacks still work.");

    return { available: true, ffmpeg: !!result.ffmpeg, python: result.python, modules, warnings, notices };
  } catch (err: any) {
    const message: string = err?.message || String(err);
    const missing = /No module named '([\w.]+)'/.exec(message)?.[1];
    const warning = missing
      ? `Missing Python package: ${missing}. Run: pip install -r requirements.txt`
      : message;
    return { available: false, error: message, warnings: [warning], notices: [] };
  }
}
