import { redactSecrets } from "@chatbotx.io/logger"
import {
  init as initSentry,
  captureException as sentryCaptureException,
  withScope,
} from "@sentry/node"
import type { ErrorClass } from "./metrics"

const MAX_RECENT_FINGERPRINTS = 512
const FINGERPRINT_TTL_MS = 60_000

const recentFingerprints = new Map<string, number>()
let errorTrackingEnabled = false

const normalizeMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error)
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "{id}")
    .replace(/\b\d{4,}\b/g, "{number}")
    .trim()
}

const isDuplicate = (fingerprint: string): boolean => {
  const now = Date.now()
  for (const [key, expiresAt] of recentFingerprints) {
    if (expiresAt <= now) {
      recentFingerprints.delete(key)
    }
  }

  if (recentFingerprints.has(fingerprint)) {
    return true
  }

  if (recentFingerprints.size >= MAX_RECENT_FINGERPRINTS) {
    const oldest = recentFingerprints.keys().next().value
    if (oldest) {
      recentFingerprints.delete(oldest)
    }
  }

  recentFingerprints.set(fingerprint, now + FINGERPRINT_TTL_MS)
  return false
}

export const initErrorTracking = (input: { service: string }): boolean => {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    return false
  }

  initSentry({
    dsn,
    environment: process.env.APP_ENV,
    release: process.env.RELEASE_SHA,
    initialScope: {
      tags: { service: input.service },
    },
    beforeSend: (event) => {
      const redacted = redactSecrets(event) as typeof event
      if (!redacted.request?.data) {
        return redacted
      }
      return {
        ...redacted,
        request: { ...redacted.request, data: "[redacted]" },
      }
    },
  })
  errorTrackingEnabled = true
  return true
}

export const captureException = (input: {
  error: unknown
  errorClass: ErrorClass
  extra?: Record<string, unknown>
  job?: string
  queue?: string
  tags?: Record<string, string | number | undefined>
}): boolean => {
  if (!errorTrackingEnabled) {
    return false
  }

  const fingerprint = [
    input.queue ?? "unknown",
    input.job ?? "unknown",
    input.errorClass,
    normalizeMessage(input.error),
  ].join("|")
  if (isDuplicate(fingerprint)) {
    return false
  }

  withScope((scope) => {
    scope.setTag("error_class", input.errorClass)
    if (input.queue) {
      scope.setTag("queue", input.queue)
    }
    if (input.job) {
      scope.setTag("job", input.job)
    }
    for (const [key, value] of Object.entries(input.tags ?? {})) {
      if (value !== undefined) {
        scope.setTag(key, String(value))
      }
    }
    for (const [key, value] of Object.entries(input.extra ?? {})) {
      scope.setExtra(key, value)
    }
    scope.setFingerprint([fingerprint])
    sentryCaptureException(input.error)
  })
  return true
}

export const resetErrorTrackingForTests = (): void => {
  errorTrackingEnabled = false
  recentFingerprints.clear()
}
