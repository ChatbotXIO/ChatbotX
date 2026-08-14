// Mirrors zod v4 `z.stringbool()` default truthy values.
const TRUTHY_ENV_VALUES = new Set(["true", "1", "yes", "on", "y", "enabled"])

/**
 * Normalizes a boolean env flag that may have skipped zod coercion.
 *
 * With `SKIP_ENV_CHECK=true` (e.g. the builder's `next build` script), t3-env
 * bypasses `z.stringbool()` entirely and the "boolean" key holds the raw
 * string from `.env` — a truthy `"false"`, or a `"true"` that crashes APIs
 * expecting strictly `boolean | object` (Drizzle's `logger` option). Booleans
 * pass through untouched; strings are matched against zod's truthy set;
 * anything else is `false`.
 */
export function parseEnvBool(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value
  }

  return (
    typeof value === "string" &&
    TRUTHY_ENV_VALUES.has(value.trim().toLowerCase())
  )
}
