import path from "path";

export interface ServerConfig {
  host: string;
  port: number;
  python: string;
  engineScript: string;
  tempDir: string;
  maxConcurrentJobs: number;
  rateLimitPerMinute: number;
  engineTimeoutMs: number;
  maxBodyMb: number;
  hfToken: string;
}

function intFrom(value: string | undefined, fallback: number, min = 1): number {
  const n = parseInt(value ?? "", 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/** Build the runtime configuration from environment variables (see .env.example). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const root = process.cwd();
  return {
    // Loopback by default: the API is unauthenticated and spawns heavy jobs.
    host: env.HOST || "127.0.0.1",
    port: intFrom(env.PORT, 3000),
    python: env.PYTHON || (process.platform === "win32" ? "python" : "python3"),
    engineScript: path.join(root, "audio_engine.py"),
    tempDir: path.join(root, "temp_audio"),
    maxConcurrentJobs: intFrom(env.MAX_CONCURRENT_JOBS, 2),
    rateLimitPerMinute: intFrom(env.RATE_LIMIT_PER_MINUTE, 30),
    engineTimeoutMs: intFrom(env.ENGINE_TIMEOUT_MS, 300_000, 1000),
    maxBodyMb: intFrom(env.MAX_BODY_MB, 50),
    hfToken: (env.HF_TOKEN || env.HUGGING_FACE_HUB_TOKEN || "").trim(),
  };
}

export function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}
