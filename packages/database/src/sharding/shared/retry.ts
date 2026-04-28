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
  "08000",
  "08003",
  "08006",
  "08001",
  "08004",
  "57P01",
  "57P02",
  "57P03",
  "40001",
  "40P01",
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
