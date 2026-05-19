const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/
const MIN_PHONE_DIGITS = 5

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_RE = /^\+?[0-9 ()\-.]{5,32}$/
export const NON_DIGIT_RE = /[^\d+]/g
const DEFAULT_MAX_LENGTH = 1000

export const cleanCell = (
  raw: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined => {
  if (typeof raw !== "string") {
    return
  }
  const trimmed = raw.trim().slice(0, maxLength)
  return trimmed.length > 0 ? trimmed : undefined
}

export const escapeFormula = (text: string | undefined): string | undefined =>
  text && FORMULA_PREFIX_RE.test(text) ? `'${text}` : text

export const cleanText = (
  raw: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined => escapeFormula(cleanCell(raw, maxLength))

export const cleanEmail = (
  raw: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined => {
  const text = cleanCell(raw, maxLength)
  if (!text) {
    return
  }
  const lower = text.toLowerCase()
  return EMAIL_RE.test(lower) ? lower : undefined
}

export const cleanPhone = (
  raw: unknown,
  maxLength: number = DEFAULT_MAX_LENGTH,
): string | undefined => {
  const text = cleanCell(raw, maxLength)
  if (!(text && PHONE_RE.test(text))) {
    return
  }
  const digits = text.replace(NON_DIGIT_RE, "")
  return digits.length >= MIN_PHONE_DIGITS ? digits : undefined
}
