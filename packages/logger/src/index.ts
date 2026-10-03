import pino, { type Logger } from "pino"
import { redactSecrets, scrubSecretsInString } from "./redact"

// Re-export the reusable log-safety helpers so a single import from
// `@chatbotx.io/logger` covers safe diagnostic logging end to end:
// `logDiagnostic` (level promotion) + `redactSecrets` / `capText` (safe payload).
export {
  capText,
  DEFAULT_MAX_LOG_CHARS,
  redactSecrets,
  scrubSecretsInString,
  toLogSafeError,
} from "./redact"

/**
 * Platform-wide safety net for the `err` log key (the standard error key, per
 * invariant #20). Expands the Error with pino's standard serializer to keep
 * type/message/stack, then runs `redactSecrets` over the result so any
 * credential a provider error captured in a URL — e.g. an OAuth refresh
 * request's `access_token`/`fb_exchange_token` on a nested `originError` — is
 * scrubbed before it reaches a transport, no matter which caller logs it. Only
 * error logs pay this cost; a plain, already-sanitized object (e.g. from
 * `toLogSafeError`) is scrubbed as-is.
 */
export const redactErrSerializer = (err: unknown): unknown =>
  redactSecrets(err instanceof Error ? pino.stdSerializers.err(err) : err)

const deriveErrorMessage = (value: unknown): string | undefined => {
  if (value instanceof Error) {
    return value.message
  }
  if (value && typeof value === "object" && "err" in value) {
    const nested = (value as { err: unknown }).err
    if (nested instanceof Error) {
      return nested.message
    }
  }
  return
}

/**
 * Scrub secrets from a log call's arguments. Any explicit message string is
 * scrubbed in place. When an Error is logged with no explicit message, pino
 * derives `msg` from the raw error message BEFORE the `err` serializer runs, so
 * a scrubbed message is appended to pre-empt that derived `msg` carrying a
 * credential. Together with the `err` serializer this keeps both the error
 * object and the top-level `msg` free of secrets, whichever way a caller logs.
 */
export const scrubLogArgs = (args: readonly unknown[]): unknown[] => {
  const out = [...args]
  let hasMessageString = false
  for (let i = 0; i < out.length; i++) {
    const arg = out[i]
    if (typeof arg === "string") {
      out[i] = scrubSecretsInString(arg)
      hasMessageString = true
    }
  }
  if (!hasMessageString) {
    const derived = deriveErrorMessage(out[0])
    if (derived !== undefined) {
      out.push(scrubSecretsInString(derived))
    }
  }
  return out
}

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() } // Use 'INFO' instead of 30
    },
  },
  hooks: {
    // Scrub the message string (and the pino-derived `msg` for a bare Error)
    // so a credential can never reach the top-level `msg`; the `err` serializer
    // covers the error object itself.
    logMethod(inputArgs, method) {
      return method.apply(
        this,
        scrubLogArgs(inputArgs) as Parameters<typeof method>,
      )
    },
  },
  serializers: { err: redactErrSerializer },
  timestamp: pino.stdTimeFunctions.isoTime, // Use ISO 8601 format
})

export const getChildLogger = (name: string) =>
  baseLogger.child({ module: name })

export default baseLogger

export type DiagnosticLevel = "info" | "debug"

/**
 * Pure + env-injectable so both branches are unit-testable without module
 * reloads. `LOG_DEBUG=true` promotes opt-in diagnostics to `info` (so they
 * survive a production `LOG_LEVEL=info`) WITHOUT enabling every other
 * `debug` line in the app.
 */
export const resolveDiagnosticLevel = (
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticLevel => (env.LOG_DEBUG === "true" ? "info" : "debug")

// Fixed for the process lifetime — re-evaluated per call would be wasted work
// since env vars don't change at runtime.
const diagnosticLevel = resolveDiagnosticLevel()

/**
 * Emit a heavy/sensitive diagnostic line at the resolved diagnostic level
 * (`debug` normally, promoted to `info` when `LOG_DEBUG=true`).
 *
 * `buildData` is lazy: it is only invoked when the resolved level is
 * enabled on `logger`, so callers pay zero cost on the hot path when the
 * line would be dropped anyway.
 *
 * The CALLER is responsible for passing already-sanitized data — this
 * helper only chooses the log level, it never sanitizes or redacts
 * anything for you.
 *
 * Reusable anywhere a verbose/PII-adjacent line should be individually
 * switchable in production without a channel- or feature-specific flag.
 */
export const logDiagnostic = (
  logger: Logger,
  buildData: () => Record<string, unknown>,
  message: string,
): void => {
  // Optional call, because the repo is full of hand-rolled logger doubles in
  // tests (`{ debug, warn, error }`) that do not model level checks. A real
  // pino logger always implements this, so production behaviour is unchanged;
  // a double that does not simply opts out of diagnostics instead of throwing
  // `isLevelEnabled is not a function` and failing tests that never asked to
  // assert on diagnostics at all.
  if (logger.isLevelEnabled?.(diagnosticLevel)) {
    logger[diagnosticLevel](buildData(), message)
  }
}
