import { logger } from "../../logger"

/**
 * Read an integer from process.env with a safe fallback. Anything that is
 * not an integer >= min (default 0) logs a warning and returns the fallback.
 */
export function envInt(
  name: string,
  fallback: number,
  options: { min?: number } = {},
): number {
  const min = options.min ?? 0
  const raw = process.env[name]
  if (raw === undefined || raw === "") {
    return fallback
  }

  const value = Number(raw)
  if (!Number.isInteger(value) || value < min) {
    logger.warn(
      { name, value: raw, min, fallback },
      "Invalid numeric environment value, using fallback",
    )
    return fallback
  }

  return value
}

/**
 * Read a boolean from process.env with a safe fallback. Accepts true/false
 * and 1/0; any other value logs a warning and returns the fallback.
 */
export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw === "") {
    return fallback
  }

  const value = raw.trim().toLowerCase()
  if (value === "true" || value === "1") {
    return true
  }
  if (value === "false" || value === "0") {
    return false
  }

  logger.warn(
    { name, value: raw, fallback },
    "Invalid boolean environment value, using fallback",
  )
  return fallback
}
