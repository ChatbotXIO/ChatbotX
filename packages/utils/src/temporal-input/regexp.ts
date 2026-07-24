const REGEXP_SPECIAL_CHARS_PATTERN = /[.*+?^${}()|[\]\\]/g

/** Escapes a literal so it is safe to embed in a generated pattern. */
export const escapeRegExp = (value: string): string =>
  value.replace(REGEXP_SPECIAL_CHARS_PATTERN, "\\$&")
