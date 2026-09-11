import pino, { type Logger } from "pino"

// Re-export the reusable log-safety helpers so a single import from
// `@chatbotx.io/logger` covers safe diagnostic logging end to end:
// `logDiagnostic` (level promotion) + `redactSecrets` / `capText` (safe payload).
export {
  capText,
  DEFAULT_MAX_LOG_CHARS,
  redactSecrets,
} from "./redact"

const baseLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() } // Use 'INFO' instead of 30
    },
  },
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
  if (logger.isLevelEnabled(diagnosticLevel)) {
    logger[diagnosticLevel](buildData(), message)
  }
}
