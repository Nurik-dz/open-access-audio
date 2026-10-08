import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, afterEach, before, describe, it } from "node:test";
import { createApp } from "./app";
import type { ServerConfig } from "./config";
import type { Engine } from "./engine";

type Call = { args: string[]; payload?: any };

/** Fake engine: records calls, and writes a fake output file for actions that need one. */
function makeEngine(overrides: Record<string, (args: string[], payload: any) => any> = {}) {
  const calls: Call[] = [];
  const engine: Engine = {
    async run(args) {
      const [action, arg] = args;
      let payload: any;
      if (arg && arg.endsWith("_req.json")) payload = JSON.parse(fs.readFileSync(arg, "utf8"));
      calls.push({ args, payload });

      if (overrides[action]) return overrides[action](args, payload);

      switch (action) {
        case "check":
          return { success: true, ffmpeg: true, python: "3.x", modules: { numpy: true, scipy: true, requests: true, edge_tts: true, speech_recognition: true, gradio_client: true } };
        case "voices":
          return { success: true, voices: [{ id: "en-US-AndrewMultilingualNeural", name: "Andrew", gender: "Male", locale: "en-US" }] };
        case "stt":
          return { success: true, text: "hello world" };
        case "analyze":
          return { success: true, profile: { pitch_hz: 120 } };
        default:
          fs.writeFileSync(payload.output_path, Buffer.from(`fake-${action}`));
          return { success: true, method: action === "sfx" ? "procedural" : "x", model: "fake-model" };
      }
    },
  };
  return { engine, calls };
}

let tempDir: string;
let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

function configWith(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    host: "127.0.0.1",
    port: 0,
    python: "python3",
    engineScript: "unused",
    tempDir,
    maxConcurrentJobs: 2,
    rateLimitPerMinute: 1000,
    engineTimeoutMs: 5000,
    maxBodyMb: 1,
    hfToken: "",
    ...overrides,
  };
}

async function start(engine: Engine, overrides: Partial<ServerConfig> = {}) {
  const app = createApp({ config: configWith(overrides), engine });
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const post = (route: string, body: unknown) =>
    fetch(base + route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { base, post };
}

before(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "app-test-"));
});

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

const leftovers = () => fs.readdirSync(tempDir);

describe("GET /api/health", () => {
  it("is ok when the engine has everything it needs", async () => {
    const { engine } = makeEngine();
    const { base } = await start(engine);
    const body: any = await (await fetch(`${base}/api/health`)).json();
    assert.equal(body.status, "ok");
    assert.equal(body.engine.available, true);
  });

  it("is degraded with an actionable warning when FFmpeg is missing", async () => {
    const { engine } = makeEngine({ check: () => ({ success: true, ffmpeg: false, python: "3", modules: { numpy: true, scipy: true, requests: true, edge_tts: true, speech_recognition: true } }) });
    const { base } = await start(engine);
    const body: any = await (await fetch(`${base}/api/health`)).json();
    assert.equal(body.status, "degraded");
    assert.match(body.engine.warnings[0], /FFmpeg/);
  });

  it("reports an unavailable engine instead of failing", async () => {
    const { engine } = makeEngine({
      check: () => {
        throw new Error('Python interpreter "python3" was not found.');
      },
    });
    const { base } = await start(engine);
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body: any = await res.json();
    assert.equal(body.status, "degraded");
    assert.equal(body.engine.available, false);
  });
});

describe("GET /api/voices", () => {
  it("caches a successful result", async () => {
    const { engine, calls } = makeEngine();
    const { base } = await start(engine);
    await fetch(`${base}/api/voices`);
    const second: any = await (await fetch(`${base}/api/voices`)).json();
    assert.equal(second.voices.length, 1);
    assert.equal(calls.filter((c) => c.args[0] === "voices").length, 1);
  });

  it("does not cache an empty result (usually a network blip)", async () => {
    const { engine, calls } = makeEngine({ voices: () => ({ success: true, voices: [] }) });
    const { base } = await start(engine);
    await fetch(`${base}/api/voices`);
    await fetch(`${base}/api/voices`);
    assert.equal(calls.filter((c) => c.args[0] === "voices").length, 2);
  });
});

describe("POST /api/tts", () => {
  it("rejects bad input with 400 and never starts the engine", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    const bad = [
      { text: "" },
      { text: "x".repeat(5001) },
      { text: "hi", rate: "fast" },
      { text: "hi", pitch: "+5" },
      { text: "hi", voice: "../../etc/passwd" },
    ];
    for (const body of bad) {
      const res = await post("/api/tts", body);
      assert.equal(res.status, 400, JSON.stringify(body).slice(0, 60));
      assert.equal(((await res.json()) as any).success, false);
    }
    assert.equal(calls.length, 0);
  });

  it("passes sanitized options to the engine and returns a data URL", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    const res = await post("/api/tts", { text: "  -hello  ", rate: "+10%", pitch: "-5Hz" });
    const body: any = await res.json();
    assert.equal(res.status, 200);
    assert.match(body.audioUrl, /^data:audio\/mp3;base64,/);
    const payload = calls.find((c) => c.args[0] === "tts")!.payload;
    assert.equal(payload.text, "-hello");
    assert.equal(payload.rate, "+10%");
    assert.equal(payload.pitch, "-5Hz");
    assert.equal(payload.volume, "+0%");
    assert.equal(payload.voice, "en-US-AndrewMultilingualNeural");
  });

  it("can return raw audio", async () => {
    const { engine } = makeEngine();
    const { post } = await start(engine);
    const res = await post("/api/tts", { text: "hi", format: "audio" });
    assert.equal(res.headers.get("content-type"), "audio/mpeg");
    assert.equal(Buffer.from(await res.arrayBuffer()).toString(), "fake-tts");
  });

  it("returns the engine's error and leaves no scratch files behind", async () => {
    const { engine } = makeEngine({
      tts: () => {
        throw new Error("Cannot connect to host speech.platform.bing.com");
      },
    });
    const { post } = await start(engine);
    const res = await post("/api/tts", { text: "hi" });
    assert.equal(res.status, 500);
    assert.match(((await res.json()) as any).error, /Cannot connect/);
    assert.deepEqual(leftovers(), []);
  });
});

describe("POST /api/sfx and /api/ambient", () => {
  it("clamps numeric parameters into safe ranges", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    await post("/api/sfx", { prompt: "boom", duration: 99999, guidance_scale: -4 });
    const sfx = calls.find((c) => c.args[0] === "sfx")!.payload;
    assert.equal(sfx.duration, 30);
    assert.equal(sfx.guidance_scale, 1);

    await post("/api/ambient", { prompt: "rain", seconds_total: "abc", steps: 100000 });
    const amb = calls.find((c) => c.args[0] === "ambient")!.payload;
    assert.equal(amb.seconds_total, 10);
    assert.equal(amb.steps, 200);
  });

  it("tells the client which method actually produced the audio", async () => {
    const { engine } = makeEngine();
    const { post } = await start(engine);
    const body: any = await (await post("/api/sfx", { prompt: "door knock" })).json();
    assert.equal(body.method, "procedural");
  });

  it("falls back to the server HF token, and prefers the request's own", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine, { hfToken: "hf_server" });
    await post("/api/sfx", { prompt: "a" });
    await post("/api/sfx", { prompt: "b", hf_token: "hf_user" });
    const sent = calls.filter((c) => c.args[0] === "sfx").map((c) => c.payload.hf_token);
    assert.deepEqual(sent, ["hf_server", "hf_user"]);
  });

  it("requires a prompt", async () => {
    const { engine } = makeEngine();
    const { post } = await start(engine);
    assert.equal((await post("/api/sfx", {})).status, 400);
    assert.equal((await post("/api/ambient", { prompt: "   " })).status, 400);
  });
});

describe("POST /api/image and /api/video", () => {
  it("clamps image dimensions", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    await post("/api/image", { prompt: "x", width: 99999, height: 3 });
    const payload = calls.find((c) => c.args[0] === "image")!.payload;
    assert.equal(payload.width, 2048);
    assert.equal(payload.height, 64);
  });

  it("whitelists video options and reports the method that ran", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    const res = await post("/api/video", { prompt: "x", seconds: 500, base_model: "evil", resolution: "8k", steps: 8, motion_style: "pan-left" });
    const body: any = await res.json();
    const payload = calls.find((c) => c.args[0] === "video")!.payload;
    assert.equal(payload.seconds, 10);
    assert.equal(payload.base_model, "epiCRealism");
    assert.equal(payload.resolution, "720p");
    assert.equal(payload.steps, 8);
    assert.equal(payload.motion_style, "pan-left");
    assert.equal(body.model, "fake-model");
    assert.match(body.videoUrl, /^data:video\/mp4;base64,/);
  });

  it("rejects a motion style containing odd characters", async () => {
    const { engine } = makeEngine();
    const { post } = await start(engine);
    assert.equal((await post("/api/video", { prompt: "x", motion_style: "zoom; rm -rf /" })).status, 400);
  });
});

describe("audio uploads (STT / analyze / clone)", () => {
  const wav = Buffer.from("RIFF....WAVEfake");

  it("accepts base64 audio with codec parameters and cleans up", async () => {
    const { engine, calls } = makeEngine();
    const { post } = await start(engine);
    const res = await post("/api/stt", { audioBase64: `data:audio/webm;codecs=opus;base64,${wav.toString("base64")}`, language: "fr-FR" });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as any).text, "hello world");
    assert.equal(calls[0].args[2], "fr-FR");
    assert.deepEqual(leftovers(), []);
  });

  it("accepts multipart uploads", async () => {
    const { engine } = makeEngine();
    const { base } = await start(engine);
    const form = new FormData();
    form.append("audio", new Blob([wav]), "clip.mp3");
    const res = await fetch(`${base}/api/analyze`, { method: "POST", body: form });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as any).profile.pitch_hz, 120);
    assert.deepEqual(leftovers(), []);
  });

  it("requires audio", async () => {
    const { engine } = makeEngine();
    const { post } = await start(engine);
    assert.equal((await post("/api/stt", {})).status, 400);
    assert.equal((await post("/api/analyze", {})).status, 400);
  });

  it("rejects a malformed language and still deletes the upload", async () => {
    const { engine, calls } = makeEngine();
    const { base } = await start(engine);
    const form = new FormData();
    form.append("audio", new Blob([wav]), "clip.wav");
    form.append("language", "en; rm -rf /");
    const res = await fetch(`${base}/api/stt`, { method: "POST", body: form });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
    assert.deepEqual(leftovers(), []);
  });

  it("validates clone text before running and deletes the reference upload", async () => {
    const { engine, calls } = makeEngine();
    const { base } = await start(engine);
    const form = new FormData();
    form.append("ref_audio", new Blob([wav]), "ref.wav");
    const res = await fetch(`${base}/api/clone`, { method: "POST", body: form });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
    assert.deepEqual(leftovers(), []);
  });

  it("clamps clone adjustments", async () => {
    const { engine, calls } = makeEngine();
    const { base } = await start(engine);
    const form = new FormData();
    form.append("ref_audio", new Blob([wav]), "ref.wav");
    form.append("text", "hello");
    form.append("pitch_adj", "9999");
    form.append("timbre_adj", "-99");
    const res = await fetch(`${base}/api/clone`, { method: "POST", body: form });
    assert.equal(res.status, 200);
    const payload = calls.find((c) => c.args[0] === "clone")!.payload;
    assert.equal(payload.pitch_adj, 100);
    assert.equal(payload.timbre_adj, -12);
    assert.deepEqual(leftovers(), []);
  });

  it("answers 413 for an upload over the size limit", async () => {
    const { engine, calls } = makeEngine();
    const { base } = await start(engine); // maxBodyMb = 1
    const form = new FormData();
    form.append("audio", new Blob([Buffer.alloc(2 * 1024 * 1024)]), "big.wav");
    const res = await fetch(`${base}/api/stt`, { method: "POST", body: form });
    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
    assert.deepEqual(leftovers(), []);
  });
});

describe("API plumbing", () => {
  it("returns JSON 404 for unknown API routes", async () => {
    const { engine } = makeEngine();
    const { base } = await start(engine);
    const res = await fetch(`${base}/api/nope`);
    assert.equal(res.status, 404);
    assert.equal(((await res.json()) as any).success, false);
  });

  it("returns 400 JSON for a malformed body", async () => {
    const { engine } = makeEngine();
    const { base } = await start(engine);
    const res = await fetch(`${base}/api/tts`, { method: "POST", headers: { "content-type": "application/json" }, body: "{bad" });
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as any).error, /JSON/);
  });

  it("rate limits generation endpoints per client", async () => {
    const { engine } = makeEngine();
    const { post, base } = await start(engine, { rateLimitPerMinute: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post("/api/tts", { text: "hi" })).status);
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);

    const limited = await post("/api/tts", { text: "hi" });
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);
    // Read-only endpoints are not throttled.
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
  });

  it("sets basic hardening headers and hides the framework", async () => {
    const { engine } = makeEngine();
    const { base } = await start(engine);
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("keeps scratch files private to the owner", async () => {
    const { engine } = makeEngine({
      tts: (_args, payload) => {
        fs.writeFileSync(payload.output_path, "x");
        // The payload file can contain an HF token, so it must not be world-readable.
        const mode = fs.statSync(_args[1]).mode & 0o777;
        assert.equal(mode & 0o077, 0, `payload file mode was ${mode.toString(8)}`);
        return { success: true };
      },
    });
    const { post } = await start(engine);
    assert.equal((await post("/api/tts", { text: "hi" })).status, 200);
  });
});
