import { stringifyPath } from "dot-prop"

export type JsonPathSegment = string | number

export const buildDotPropPath = (segments: JsonPathSegment[]): string =>
  stringifyPath(segments, { preferDotForIndices: true })

export type ParseJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; error: string }

export const parseJsonSafely = (raw: string): ParseJsonResult => {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: "Empty input" }
  }

  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid JSON",
    }
  }
}
