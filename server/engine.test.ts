import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { createEngine, parseEngineOutput, probeEngine } from "./engine";
import { HttpError } from "./errors";

describe("parseEngineOutput", () => {
  it("parses a single JSON object", () => {
    assert.deepEqual(parseEngineOutput('{"success":true}'), { success: true });
  });

  it("ignores noise lines and prefers the last JSON line", () => {
    const out = 'banner\n{"first":1}\nwarning: something\n{"success":true,"n":2}\n';
    assert.deepEqual(parseEngineOutput(out), { success: true, n: 2 });
  });

  it("returns null when there is no JSON", () => {
    assert.equal(parseEngineOutput("Traceback (most recent call last):"), null);
    assert.equal(parseEngineOutput(""), null);
  });
});

// A tiny stand-in for audio_engine.py, run by Node so the tests need no Python.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-test-"));
const script = path.join(dir, "fake_engine.js");
fs.writeFileSync(
  script,
  `
const action = process.argv[2];
const start = Date.now();
if (action === "ok") { console.log("noise"); console.log(JSON.stringify({ success: true, echo: process.argv.slice(3) })); }
else if (action === "fail") { console.log(JSON.stringify({ success: false, error: "boom" })); process.exit(1); }
else if (action === "crash") { console.error("Traceback...\\nValueError: bad"); process.exit(1); }
else if (action === "garbage") { console.log("not json"); }
else if (action === "sleep") { setTimeout(() => console.log(JSON.stringify({ success: true, start, end: Date.now() })), 250); }
else if (action === "hang") { setInterval(() => {}, 1000); }
else if (action === "check") { console.log(JSON.stringify({ success: true, ffmpeg: true, python: "9.9", modules: { numpy: true, scipy: true, requests: true, edge_tts: true, speech_recognition: true, gradio_client: false } })); }
`
);

const base = { python: process.execPath, engineScript: script, maxConcurrentJobs: 2, engineTimeoutMs: 5000 };

after(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("createEngine", () => {
  it("returns parsed output and passes arguments through", async () => {
    const result = await createEngine(base).run(["ok", "a", "b"]);
    assert.deepEqual(result, { success: true, echo: ["a", "b"] });
  });

  it("surfaces the engine's own error message on non-zero exit", async () => {
    await assert.rejects(createEngine(base).run(["fail"]), /boom/);
  });

  it("falls back to stderr when the engine crashes without JSON", async () => {
    await assert.rejects(createEngine(base).run(["crash"]), /ValueError: bad/);
  });

  it("rejects unparseable output", async () => {
    await assert.rejects(createEngine(base).run(["garbage"]), /Failed to parse engine output/);
  });

  it("kills and reports a job that exceeds the timeout", async () => {
    const engine = createEngine({ ...base, engineTimeoutMs: 1000 });
    const started = Date.now();
    await assert.rejects(engine.run(["hang"]), /timed out/);
    assert.ok(Date.now() - started < 4000);
  });

  it("gives an actionable error when the interpreter is missing instead of crashing", async () => {
    const engine = createEngine({ ...base, python: "definitely-not-a-real-python" });
    await assert.rejects(engine.run(["ok"]), /was not found.*PYTHON/s);
  });

  it("never runs more jobs at once than maxConcurrentJobs", async () => {
    const engine = createEngine({ ...base, maxConcurrentJobs: 1 });
    const [a, b] = await Promise.all([engine.run(["sleep"]), engine.run(["sleep"])]);
    const [first, second] = a.start <= b.start ? [a, b] : [b, a];
    assert.ok(second.start >= first.end - 5, "second job must start after the first finished");
  });

  it("runs jobs in parallel up to the limit", async () => {
    const engine = createEngine({ ...base, maxConcurrentJobs: 2 });
    const [a, b] = await Promise.all([engine.run(["sleep"]), engine.run(["sleep"])]);
    assert.ok(Math.abs(a.start - b.start) < 200, "both jobs should start together");
  });

  it("sheds load with 503 once the queue is full", async () => {
    const engine = createEngine({ ...base, maxConcurrentJobs: 1 });
    // 1 running + 20 queued fills the queue; the next one must be refused.
    const jobs = Array.from({ length: 21 }, () => engine.run(["sleep"]));
    await assert.rejects(engine.run(["sleep"]), (e: any) => e instanceof HttpError && e.status === 503);
    await Promise.all(jobs);
  });

  it("lets priority jobs bypass a saturated queue", async () => {
    const engine = createEngine({ ...base, maxConcurrentJobs: 1 });
    const slow = engine.run(["sleep"]);
    const quick = await engine.run(["ok"], { priority: true });
    assert.equal(quick.success, true);
    await slow;
  });
});

describe("probeEngine", () => {
  it("reports capabilities and optional notices", async () => {
    const real = createEngine(base);
    const status = await probeEngine({ run: (_args, options) => real.run(["check"], options) });
    assert.equal(status.available, true);
    assert.equal(status.python, "9.9");
    assert.deepEqual(status.warnings, []);
    assert.equal(status.notices.length, 1);
  });

  it("never throws and explains a missing interpreter", async () => {
    const status = await probeEngine(createEngine({ ...base, python: "definitely-not-a-real-python" }));
    assert.equal(status.available, false);
    assert.match(status.warnings[0], /not found/);
  });

  it("turns ModuleNotFoundError into an install hint", async () => {
    const status = await probeEngine({
      run: async () => {
        throw new Error("ModuleNotFoundError: No module named 'scipy'");
      },
    });
    assert.match(status.warnings[0], /Missing Python package: scipy.*pip install/);
  });
});
