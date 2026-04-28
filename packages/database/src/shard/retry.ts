import { ShardUnreachableError } from "./errors"

export interface RetryOptions {
  baseDelayMs?: number
  maxDelayMs?: number
  maxRetries?: number
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelayMs: 100,
  maxDelayMs: 2000,
}

const RETRYABLE_PG_CODES = new Set([
  "08000", // connection_exception
  "08003", // connection_does_not_exist
  "08006", // connection_failure
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08004", // sqlserver_rejected_establishment_of_sqlconnection
  "57P01", // admin_shutdown
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "40001", // serialization_failure
  "40P01", // deadlock_detected
])

const RETRYABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
])

function isRetryableError(error: unknown): boolean {
  if (error instanceof ShardUnreachableError) {
    return true
  }

  if (error instanceof Error && "code" in error) {
    const code = String((error as Error & { code: unknown }).code)
    return RETRYABLE_PG_CODES.has(code) || RETRYABLE_ERROR_CODES.has(code)
  }

  return false
}

export async function withShardRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs } = {
    ...DEFAULT_OPTIONS,
    ...options,
  }

  let lastError: Error | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (!isRetryableError(error)) {
        throw error
      }

      if (attempt === maxRetries) {
        break
      }

      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      await sleep(delay)
    }
  }

  throw lastError
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
