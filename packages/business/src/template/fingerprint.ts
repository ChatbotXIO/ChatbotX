/**
 * Canonical comparison form of template content. A fingerprint is used ONLY to
 * tell whether content changed, never as backup content: it drops what the
 * installer owns, and it treats declared sets as unordered.
 */

type Json = unknown

/** Object keys sorted, `undefined` dropped; array order is kept. */
export const canonicalize = (value: Json): Json => {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

const sortSet = (items: readonly Json[]): Json[] =>
  items
    .map((item) => ({ item, key: JSON.stringify(canonicalize(item)) }))
    .sort((left, right) => (left.key < right.key ? -1 : 1))
    .map(({ item }) => item)

const isRecord = (value: Json): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const sortAtPath = (node: Json, segments: readonly string[]): Json => {
  const [segment, ...rest] = segments
  if (segment === undefined) {
    return Array.isArray(node) ? sortSet(node) : node
  }
  if (!isRecord(node)) {
    return node
  }
  const isEach = segment.endsWith("[]")
  const name = isEach ? segment.slice(0, -2) : segment
  const child = node[name]
  if (child === undefined) {
    return node
  }
  if (isEach) {
    return {
      ...node,
      [name]: Array.isArray(child)
        ? child.map((item) => sortAtPath(item, rest))
        : child,
    }
  }
  return { ...node, [name]: sortAtPath(child, rest) }
}

/**
 * Sorts only the arrays at `paths` (true sets). Every other array keeps its
 * order: actions, messages, steps and node lists are ordered content. A path is
 * dot-separated; `items[].tags` reaches the `tags` set inside every element of
 * `items`.
 */
export const sortUnorderedPaths = (
  value: Json,
  paths: readonly string[] | undefined,
): Json => {
  let result = value
  for (const path of paths ?? []) {
    result = sortAtPath(result, path.split("."))
  }
  return result
}

/** What an adapter declares so its entries can be compared without noise. */
export type ResourceFingerprint = {
  /** The entry minus installer-owned fields and derived counters. */
  project?: (entry: Record<string, unknown>) => Json
  /** Paths (of the projection) holding true sets. */
  unorderedPaths?: readonly string[]
}

/** The entry as a fingerprint sees it. */
export const fingerprintEntry = (
  fingerprint: ResourceFingerprint | undefined,
  entry: Record<string, unknown>,
): Json =>
  sortUnorderedPaths(
    fingerprint?.project ? fingerprint.project(entry) : entry,
    fingerprint?.unorderedPaths,
  )

/** A copy of `record` without `keys`. */
export const omitKeys = <T extends Record<string, unknown>>(
  record: T,
  keys: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(record).filter(([key]) => !keys.includes(key)),
  )
