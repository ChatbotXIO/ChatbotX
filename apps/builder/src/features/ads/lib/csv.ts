const CSV_ESCAPE_RE = /[",\n\r]/
const CSV_FORMULA_PREFIX_RE = /^[=+\-@\t\r]/

export function escapeCsvCell(
  value: string | number | null | undefined,
): string {
  const text = value === null || value === undefined ? "" : String(value)
  const sanitized = CSV_FORMULA_PREFIX_RE.test(text) ? `'${text}` : text
  if (!CSV_ESCAPE_RE.test(sanitized)) {
    return sanitized
  }
  return `"${sanitized.replaceAll('"', '""')}"`
}

export function toCsvRow(values: Array<string | number | null | undefined>) {
  return `${values.map(escapeCsvCell).join(",")}\n`
}
