import { HttpError } from "./errors";

/** Parse `value` as a number and clamp it to [min, max]; non-numeric input yields `fallback`. */
export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

/** Require a non-empty string of at most `max` characters, returned trimmed. */
export function requireText(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new HttpError(400, `${label} is too long (${text.length} > ${max} characters).`);
  }
  return text;
}

/** Return `value` if it is a string matching `pattern`, `fallback` if absent, else a 400. */
export function matchOrDefault(value: unknown, pattern: RegExp, fallback: string, label: string): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new HttpError(400, `Invalid ${label}.`);
  }
  return value;
}

export function pickOne<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Edge-TTS option formats, e.g. "+10%" and "-5Hz". */
export const PERCENT_PATTERN = /^[+-]\d{1,3}%$/;
export const HERTZ_PATTERN = /^[+-]\d{1,3}Hz$/;
/** Voice short names such as "en-US-AndrewMultilingualNeural" or "zh-CN-liaoning-XiaobeiNeural". */
export const VOICE_PATTERN = /^[A-Za-z0-9-]{3,80}$/;

/** Decode a base64 string, optionally prefixed with a `data:<mime>;base64,` header. */
export function decodeDataUrl(input: unknown, maxBytes: number, label: string): Buffer {
  if (typeof input !== "string" || !input) {
    throw new HttpError(400, `${label} is required.`);
  }
  const payload = input.replace(/^data:[^,]*;base64,/, "");
  // 4 base64 chars encode 3 bytes; reject before allocating anything large.
  if (Math.floor((payload.length * 3) / 4) > maxBytes) {
    throw new HttpError(413, `${label} is too large.`);
  }
  const buffer = Buffer.from(payload, "base64");
  if (buffer.length === 0) {
    throw new HttpError(400, `${label} is empty or not valid base64.`);
  }
  return buffer;
}

/** Hugging Face tokens are short opaque strings; reject anything else outright. */
export function cleanToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const token = value.trim();
  return token.length > 0 && token.length <= 200 && !/\s/.test(token) ? token : "";
}
