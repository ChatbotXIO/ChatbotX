export type JsonPathSegment = string | number

type ParsedSegment = { segment: JsonPathSegment; next: number }

const QUOTES = ['"', "'"]
const DIGITS_ONLY = /^\d+$/

/**
 * Reads an unquoted key. A backslash escapes the next character, matching the
 * form `dot-prop`'s `stringifyPath` writes (`a\\.b`, `x\\[0]`), so a path the
 * builder's JSON picker used to emit still reads back to the same key.
 */
const readBareKey = (path: string, start: number): ParsedSegment | null => {
  let key = ""
  let cursor = start
  while (cursor < path.length && path[cursor] !== "." && path[cursor] !== "[") {
    if (path[cursor] === "\\" && cursor + 1 < path.length) {
      cursor += 1
    }
    key += path[cursor]
    cursor += 1
  }
  return cursor === start ? null : { segment: key, next: cursor }
}

/**
 * `["…"]` holds a JSON string literal, so a key may contain `"`, `\\`, `]` or
 * control characters (escaped as JSON does). The literal is scanned to its
 * unescaped closing quote and decoded with `JSON.parse`.
 */
const readDoubleQuotedSegment = (
  path: string,
  start: number,
): ParsedSegment | null => {
  const literalStart = start + 1
  let cursor = literalStart + 1
  while (cursor < path.length && path[cursor] !== '"') {
    cursor += path[cursor] === "\\" ? 2 : 1
  }
  if (cursor >= path.length || path[cursor + 1] !== "]") {
    return null
  }
  try {
    const key: unknown = JSON.parse(path.slice(literalStart, cursor + 1))
    return typeof key === "string" ? { segment: key, next: cursor + 2 } : null
  } catch {
    return null
  }
}

const readBracketSegment = (
  path: string,
  start: number,
): ParsedSegment | null => {
  const opener = path[start + 1]
  if (opener === '"') {
    return readDoubleQuotedSegment(path, start)
  }
  if (opener !== undefined && QUOTES.includes(opener)) {
    const closeQuote = path.indexOf(opener, start + 2)
    if (closeQuote === -1 || path[closeQuote + 1] !== "]") {
      return null
    }
    return {
      segment: path.slice(start + 2, closeQuote),
      next: closeQuote + 2,
    }
  }
  const close = path.indexOf("]", start + 1)
  if (close === -1) {
    return null
  }
  const index = path.slice(start + 1, close)
  // Only an index that survives `Number()` unchanged: a longer one would be
  // rounded into a different (or unreadable) path when rewritten.
  return INDEX_KEY.test(index)
    ? { segment: Number(index), next: close + 1 }
    : null
}

const readSegment = (path: string, cursor: number): ParsedSegment | null => {
  if (path[cursor] === "[") {
    return readBracketSegment(path, cursor)
  }
  return readBareKey(path, path[cursor] === "." ? cursor + 1 : cursor)
}

const hasRootMarker = (path: string): boolean =>
  path.startsWith("$") && (path.length === 1 || ".[".includes(path[1] ?? ""))

/**
 * Parses a JSONPath-style accessor (`$.a.b[0]`, `$["a-b"].c`, or the bare
 * `a.b.0` form) into path segments. `$` alone is the root (no segments).
 * Returns `null` for syntax this subset does not support (filters, wildcards,
 * recursive descent, unterminated brackets) so callers can reject it.
 */
export const parseJsonPath = (input: string): JsonPathSegment[] | null => {
  const trimmed = input.trim()
  if (trimmed.length === 0) {
    return null
  }
  // `$` is the root only when it stands alone or is followed by `.`/`[`; a key
  // such as `$type` keeps its `$`.
  const path = hasRootMarker(trimmed) ? trimmed.slice(1) : trimmed
  const segments: JsonPathSegment[] = []
  let cursor = 0
  while (cursor < path.length) {
    const parsed = readSegment(path, cursor)
    if (!parsed) {
      return null
    }
    segments.push(parsed.segment)
    cursor = parsed.next
  }
  return segments
}

const PLAIN_KEY = /^[A-Za-z_][A-Za-z0-9_]*$/
// A canonical integer short enough to survive `Number()`; `[7]` reads an array
// item or an object's own "7" key alike, so it is the form of a bare `a.7`.
const INDEX_KEY = /^(0|[1-9]\d{0,14})$/

/**
 * The canonical `$` form of a path (`$.a[0]["a-b"]`). Total: any key is
 * representable because a non-identifier key is written as a JSON string
 * literal, which `parseJsonPath` reads back to the same key (a digits-only key
 * becomes an index, which `readJsonPath` resolves to the same member).
 */
export const formatJsonPath = (segments: JsonPathSegment[]): string =>
  segments.reduce<string>((path, segment) => {
    if (typeof segment === "number" || INDEX_KEY.test(segment)) {
      return `${path}[${segment}]`
    }
    return PLAIN_KEY.test(segment)
      ? `${path}.${segment}`
      : `${path}[${JSON.stringify(segment)}]`
  }, "$")

/** The canonical `$` form of any accepted input; `null` when it does not parse. */
export const canonicalizeJsonPath = (input: string): string | null => {
  const segments = parseJsonPath(input)
  return segments ? formatJsonPath(segments) : null
}

export type JsonPathEntry = {
  segments: JsonPathSegment[]
  path: string
  /** Primitive value as text (truncated); `null` for objects and arrays. */
  preview: string | null
}

type JsonPathEntryListing = {
  entries: JsonPathEntry[]
  truncated: boolean
}

const DEFAULT_MAX_ENTRIES = 2000
const DEFAULT_MAX_PREVIEW_LENGTH = 120

const previewOf = (value: unknown, maxLength: number): string | null => {
  if (typeof value === "object" && value !== null) {
    return null
  }
  const text = typeof value === "string" ? value : String(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * Every node of a payload, in document order, for the picker's search. The walk
 * stops at `maxEntries` visited nodes (a 64 KiB sample can still hold thousands),
 * children are expanded lazily and previews are truncated before any other work.
 */
export const listJsonPathEntries = (
  root: unknown,
  options: { maxEntries?: number; maxPreviewLength?: number } = {},
): JsonPathEntryListing => {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
  const maxPreviewLength =
    options.maxPreviewLength ?? DEFAULT_MAX_PREVIEW_LENGTH
  const entries: JsonPathEntry[] = []
  const pending: { value: unknown; segments: JsonPathSegment[] }[] = [
    { value: root, segments: [] },
  ]
  for (let next = pending.pop(); next; next = pending.pop()) {
    if (entries.length >= maxEntries) {
      return { entries, truncated: true }
    }
    const { value, segments } = next
    entries.push({
      segments,
      path: formatJsonPath(segments),
      preview: previewOf(value, maxPreviewLength),
    })
    if (typeof value === "object" && value !== null) {
      const children: [JsonPathSegment, unknown][] = Array.isArray(value)
        ? value.map((item, index) => [index, item])
        : Object.entries(value)
      // Reversed so the first child is popped first (document order).
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const [key, item] = children[index] as [JsonPathSegment, unknown]
        pending.push({ value: item, segments: [...segments, key] })
      }
    }
  }
  return { entries, truncated: false }
}

/** An own member; on arrays only integer indices (never `length`). */
const hasReadableMember = (
  container: unknown,
  segment: JsonPathSegment,
): boolean => {
  if (typeof container !== "object" || container === null) {
    return false
  }
  if (Array.isArray(container) && !DIGITS_ONLY.test(String(segment))) {
    return false
  }
  return Object.hasOwn(container, segment)
}

/**
 * Reads the value a JSONPath points at, following own properties only (so a
 * payload cannot reach `length`, `toString` or the prototype chain).
 * `undefined` when the path is invalid, the payload is not an object/array,
 * or nothing exists there.
 */
export const readJsonPath = (payload: unknown, path: string): unknown => {
  const segments = parseJsonPath(path)
  if (!segments || typeof payload !== "object" || payload === null) {
    return
  }
  let current: unknown = payload
  for (const segment of segments) {
    if (!hasReadableMember(current, segment)) {
      return
    }
    current = (current as Record<JsonPathSegment, unknown>)[segment]
  }
  return current
}

/**
 * Text form stored into a contact field: strings as-is, everything else
 * JSON-encoded, `null`/`undefined` → `undefined` (skipped). Same rule
 * `externalRequestService.executeAndMap` applies to response values.
 */
export const stringifyJsonPathValue = (value: unknown): string | undefined => {
  if (value === undefined || value === null) {
    return
  }
  return typeof value === "string" ? value : JSON.stringify(value)
}

const MAX_JSONB_DEPTH = 64

const isJsonbText = (text: string): boolean =>
  !text.includes("\u0000") && text.isWellFormed()

/**
 * `JSON.parse` and `JSON.stringify` accept values Postgres `jsonb` refuses: a
 * NUL character, a lone surrogate, or nesting deep enough to exhaust the
 * stack. Saving one fails with a database error the caller cannot fix, so
 * callers check first. One iterative, depth-bounded walk.
 */
export const isJsonbStorable = (root: unknown): boolean => {
  const pending: { value: unknown; depth: number }[] = [
    { value: root, depth: 1 },
  ]
  for (let next = pending.pop(); next; next = pending.pop()) {
    const { value, depth } = next
    if (typeof value === "string") {
      if (!isJsonbText(value)) {
        return false
      }
    } else if (typeof value === "object" && value !== null) {
      if (depth > MAX_JSONB_DEPTH) {
        return false
      }
      const entries: [string | null, unknown][] = Array.isArray(value)
        ? value.map((item) => [null, item])
        : Object.entries(value)
      for (const [key, item] of entries) {
        if (key !== null && !isJsonbText(key)) {
          return false
        }
        pending.push({ value: item, depth: depth + 1 })
      }
    }
  }
  return true
}
