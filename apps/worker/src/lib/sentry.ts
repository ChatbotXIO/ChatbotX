import {
  flush,
  getClient,
  captureException as sentryCaptureException,
} from "@sentry/node"
import type { Job } from "bullmq"

/**
 * Whether Sentry was initialized (i.e. a DSN was provided). When false, every
 * helper below is a cheap no-op, so call sites don't need their own guards.
 */
export function isSentryEnabled(): boolean {
  return Boolean(getClient())
}

/**
 * Capture an arbitrary exception with optional structured context.
 * Safe to call even when Sentry is disabled — it just returns.
 */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!isSentryEnabled()) {
    return
  }

  sentryCaptureException(err, context ? { extra: context } : undefined)
}

/**
 * Report a BullMQ job failure. Only the *final* attempt is sent: a job that
 * still has retries left would otherwise emit a duplicate event on every
 * attempt and burn through the Sentry quota during a retry storm.
 *
 * Job payloads can contain contact PII, so only identifiers and retry metadata
 * are attached — never the raw `job.data`.
 */
export function reportJobFailure(
  job: Job | undefined,
  err: unknown,
  context: { worker: string },
): void {
  if (!(job && isSentryEnabled())) {
    return
  }

  const attemptsMade = job.attemptsMade ?? 0
  const maxAttempts = job.opts?.attempts ?? 1

  // Still has retries left — wait for the final attempt before reporting.
  if (attemptsMade < maxAttempts) {
    return
  }

  sentryCaptureException(err, (scope) => {
    scope.setTag("worker", context.worker)
    scope.setTag("queue", job.queueName)
    scope.setTag("job.name", job.name)
    scope.setContext("job", {
      id: job.id,
      name: job.name,
      queue: job.queueName,
      attemptsMade,
      maxAttempts,
    })
    return scope
  })
}

/**
 * Flush queued Sentry events before the process exits. Best-effort: never block
 * shutdown if Sentry is slow or unreachable.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!isSentryEnabled()) {
    return
  }

  try {
    await flush(timeoutMs)
  } catch {
    // ignore — shutdown must not hang on Sentry
  }
}
