import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HttpError } from "./errors";
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

describe("clampNumber / clampInt", () => {
  it("clamps into range", () => {
    assert.equal(clampNumber(999, 5, 1, 10), 10);
    assert.equal(clampNumber(-3, 5, 1, 10), 1);
    assert.equal(clampNumber("7.5", 5, 1, 10), 7.5);
  });

  it("falls back on non-numeric input", () => {
    assert.equal(clampNumber("abc", 5, 1, 10), 5);
    assert.equal(clampNumber(undefined, 5, 1, 10), 5);
    assert.equal(clampNumber(NaN, 5, 1, 10), 5);
    assert.equal(clampNumber(Infinity, 5, 1, 10), 5);
  });

  it("rounds integers", () => {
    assert.equal(clampInt("42.6", 0, 0, 100), 43);
    assert.equal(clampInt("nope", 7, 0, 100), 7);
  });
});

describe("requireText", () => {
  it("trims and returns valid text", () => {
    assert.equal(requireText("  hello ", 10, "Text"), "hello");
  });

  it("rejects empty, non-string and over-long input with 400", () => {
    for (const bad of ["", "   ", undefined, 42, null]) {
      assert.throws(() => requireText(bad, 10, "Text"), (e: any) => e instanceof HttpError && e.status === 400);
    }
    assert.throws(() => requireText("x".repeat(11), 10, "Text"), /too long/);
  });
});

describe("matchOrDefault / TTS patterns", () => {
  it("accepts Edge-TTS formats", () => {
    assert.equal(matchOrDefault("+10%", PERCENT_PATTERN, "+0%", "rate"), "+10%");
    assert.equal(matchOrDefault("-5Hz", HERTZ_PATTERN, "+0Hz", "pitch"), "-5Hz");
    assert.equal(matchOrDefault("en-US-AndrewMultilingualNeural", VOICE_PATTERN, "x", "voice"), "en-US-AndrewMultilingualNeural");
    assert.equal(matchOrDefault("zh-CN-liaoning-XiaobeiNeural", VOICE_PATTERN, "x", "voice"), "zh-CN-liaoning-XiaobeiNeural");
  });

  it("uses the default when absent", () => {
    assert.equal(matchOrDefault(undefined, PERCENT_PATTERN, "+0%", "rate"), "+0%");
    assert.equal(matchOrDefault("", PERCENT_PATTERN, "+0%", "rate"), "+0%");
  });

  it("rejects anything that could smuggle CLI options or shell syntax", () => {
    for (const bad of ["fast", "10%", "+10", "--help", "+10%; rm -rf /", "+1000%"]) {
      assert.throws(() => matchOrDefault(bad, PERCENT_PATTERN, "+0%", "rate"), /Invalid rate/);
    }
    for (const bad of ["../../etc/passwd", "voice name", "a", "-v", "x".repeat(81)]) {
      assert.throws(() => matchOrDefault(bad, VOICE_PATTERN, "x", "voice"), /Invalid voice/);
    }
  });
});

describe("pickOne", () => {
  it("returns allowed values and falls back otherwise", () => {
    assert.equal(pickOne("ToonYou", ["epiCRealism", "ToonYou"] as const, "epiCRealism"), "ToonYou");
    assert.equal(pickOne("evil", ["epiCRealism", "ToonYou"] as const, "epiCRealism"), "epiCRealism");
    assert.equal(pickOne(5, ["a", "b"] as const, "a"), "a");
  });
});

describe("decodeDataUrl", () => {
  const raw = Buffer.from("RIFFdata");

  it("decodes plain base64 and data URLs, including codec parameters", () => {
    assert.deepEqual(decodeDataUrl(raw.toString("base64"), 1000, "Audio"), raw);
    assert.deepEqual(decodeDataUrl(`data:audio/wav;base64,${raw.toString("base64")}`, 1000, "Audio"), raw);
    assert.deepEqual(decodeDataUrl(`data:audio/webm;codecs=opus;base64,${raw.toString("base64")}`, 1000, "Audio"), raw);
  });

  it("rejects missing, empty and oversized input", () => {
    assert.throws(() => decodeDataUrl(undefined, 1000, "Audio"), (e: any) => e.status === 400);
    assert.throws(() => decodeDataUrl("", 1000, "Audio"), (e: any) => e.status === 400);
    assert.throws(() => decodeDataUrl("data:audio/wav;base64,", 1000, "Audio"), (e: any) => e.status === 400);
    assert.throws(() => decodeDataUrl(Buffer.alloc(5000).toString("base64"), 1000, "Audio"), (e: any) => e.status === 413);
  });
});

describe("cleanToken", () => {
  it("keeps plausible tokens and drops junk", () => {
    assert.equal(cleanToken("  hf_abc123 "), "hf_abc123");
    assert.equal(cleanToken("has space"), "");
    assert.equal(cleanToken("x".repeat(201)), "");
    assert.equal(cleanToken(undefined), "");
    assert.equal(cleanToken({}), "");
  });
});
