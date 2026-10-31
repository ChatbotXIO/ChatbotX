import { MAX_WALK_DEPTH } from "./reference-fields"

/**
 * Calls `visit` with every string leaf of attacker-shaped JSON. Past
 * `MAX_WALK_DEPTH` the rest of the subtree is skipped (a missed visit, never
 * a stack overflow).
 */
export const forEachStringLeaf = (
  value: unknown,
  visit: (text: string) => void,
  depth = 0,
): void => {
  if (depth > MAX_WALK_DEPTH) {
    return
  }
  if (typeof value === "string") {
    visit(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      forEachStringLeaf(item, visit, depth + 1)
    }
    return
  }
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) {
      forEachStringLeaf(child, visit, depth + 1)
    }
  }
}

/**
 * Structural clone of `value` with `rewrite` applied to every string leaf.
 * Never mutates the input; past `MAX_WALK_DEPTH` the remaining subtree is
 * returned unchanged (a missed rewrite, never dropped data).
 */
export const mapStringLeaves = <T>(
  value: T,
  rewrite: (text: string) => string,
  depth = 0,
): T => {
  if (depth > MAX_WALK_DEPTH) {
    return value
  }
  if (typeof value === "string") {
    return rewrite(value) as T
  }
  if (Array.isArray(value)) {
    return value.map((item) => mapStringLeaves(item, rewrite, depth + 1)) as T
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        mapStringLeaves(child, rewrite, depth + 1),
      ]),
    ) as T
  }
  return value
}

/** Splits `prefix:id` at the first colon; `null` when there is no prefix. */
export const splitPrefixedToken = (
  token: string,
): { prefix: string; id: string } | null => {
  const separatorIndex = token.indexOf(":")
  if (separatorIndex <= 0) {
    return null
  }
  return {
    prefix: token.slice(0, separatorIndex),
    id: token.slice(separatorIndex + 1),
  }
}
