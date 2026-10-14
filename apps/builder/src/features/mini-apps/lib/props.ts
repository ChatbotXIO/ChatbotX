/** Small readers for the loosely typed `props` of a Mini App node. */

export const readString = (value: unknown): string =>
  typeof value === "string" ? value : ""

export const readStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : []

/** An array prop, or an empty list when the prop is missing or not an array. */
export const readArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : []

/** `ids` with `id` added (`included`) or removed. */
export const withId = (
  ids: readonly string[],
  id: string,
  included: boolean,
): string[] => (included ? [...ids, id] : ids.filter((other) => other !== id))
