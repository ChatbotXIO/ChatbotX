/**
 * Shared CSV serialization for every export the product writes. Pure and
 * runtime-agnostic (no Node APIs), so the builder's Edge-reachable code and the
 * worker can both import it.
 *
 * Two dialects, both doubling embedded quotes and guarding formulas:
 * - "always" (default): every field is quoted and line breaks are flattened to
 *   a space, so one record is always one physical line.
 * - "minimal": RFC 4180 — a field is quoted only when it holds a delimiter,
 *   quote, or line break, which it keeps. For exports whose existing consumers
 *   expect bare fields.
 */

/**
 * UTF-8 byte-order mark (EF BB BF). Excel on Windows decodes a CSV without it
 * using the system ANSI code page, which garbles non-ASCII text ("Nguyễn" →
 * "Nguyá»…n"). Write it once, before the header row; the import parsers strip
 * it on the way back in.
 */
export const UTF8_BOM = "\uFEFF"

export type CsvCell = string | number | null | undefined

export type CsvDialect = "always" | "minimal"

// Leading characters a spreadsheet may evaluate as a formula (CSV injection).
const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/
const LINE_BREAK_RE = /\r?\n/g
// Characters that force a field to be quoted in the minimal dialect.
const NEEDS_QUOTING_RE = /[",\r\n]/

/**
 * Quotes a trusted value as-is. Use it only for content the product itself
 * authored (e.g. an import template), never for user data.
 */
export const quoteCsvField = (text: string): string =>
  `"${text.replaceAll('"', '""')}"`

/**
 * Serializes an untrusted value into one CSV field: null/undefined become
 * empty and a leading formula character is neutralized with a single quote
 * (OWASP CSV-injection guidance). Quoting and line breaks follow `dialect`.
 */
export const escapeCsvCell = (
  value: CsvCell,
  dialect: CsvDialect = "always",
): string => {
  const raw = (value ?? "").toString()
  const text = dialect === "always" ? raw.replace(LINE_BREAK_RE, " ") : raw
  const guarded = FORMULA_PREFIX_RE.test(text) ? `'${text}` : text
  return dialect === "minimal" && !NEEDS_QUOTING_RE.test(guarded)
    ? guarded
    : quoteCsvField(guarded)
}

/** Serializes one record, newline-terminated. */
export const toCsvRow = (
  cells: readonly CsvCell[],
  dialect: CsvDialect = "always",
): string => `${cells.map((cell) => escapeCsvCell(cell, dialect)).join(",")}\n`
