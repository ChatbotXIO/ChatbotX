import { z } from "zod"
import { logger } from "../../logger"

/**
 * Read an integer from process.env with a safe fallback. Anything that is
 * not an integer >= min (default 0) logs a warning and returns the fallback.
 *
 * Built on zod (not @t3-oss/env-core): the shard pool/replica knobs this
 * backs must degrade gracefully (warn + fallback) rather than crash the
 * process, and each call targets an arbitrary, caller-supplied `name` rather
 * than a single static schema — both are a poor fit for `createEnv()`, whose
 * default `onValidationError` throws and which expects one schema object
 * defined once (see `../../keys.ts` for the throw-on-invalid, fixed-schema
 * case this package also uses for required config like DATABASE_URL).
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

  return z.coerce
    .number()
    .int()
    .min(min)
    .catch(() => {
      logger.warn(
        { name, value: raw, min, fallback },
        "Invalid numeric environment value, using fallback",
      )
      return fallback
    })
    .parse(raw)
}

const booleanLiteralSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.enum(["true", "1", "false", "0"]))
  .transform((value) => value === "true" || value === "1")

/**
 * Read a boolean from process.env with a safe fallback. Accepts true/false
 * and 1/0; any other value logs a warning and returns the fallback.
 *
 * Deliberately NOT `z.stringbool()`: that accepts a wider set ("yes", "on",
 * etc.) than this whitelist, which would silently change which values flip a
 * shard feature flag on in production instead of warning + falling back.
 */
export function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw === "") {
    return fallback
  }

  return booleanLiteralSchema
    .catch(() => {
      logger.warn(
        { name, value: raw, fallback },
        "Invalid boolean environment value, using fallback",
      )
      return fallback
    })
    .parse(raw)
}
