import type { logger as workerLogger } from "../../../lib/logger"

type WorkerLogger = typeof workerLogger

// Threshold for promoting a single provider attempt's log from `debug` to
// `warn` so slow calls stay visible in prod (LOG_LEVEL defaults to "info").
// Well below `aiTimeouts.aiTotal` (120s) so it flags degradation early.
export const SLOW_PROVIDER_ATTEMPT_MS = 20_000

export function logProviderAttempt(
  logger: WorkerLogger,
  durationMs: number,
  payload: Record<string, unknown>,
  logMessage: string,
): void {
  // `debug` is dropped by default in prod (LOG_LEVEL defaults to "info"),
  // so promote to `warn` when the attempt is slow.
  if (durationMs > SLOW_PROVIDER_ATTEMPT_MS) {
    logger.warn(payload, `${logMessage} (slow)`)
  } else {
    logger.debug(payload, logMessage)
  }
}
