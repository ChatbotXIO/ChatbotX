import { UnrecoverableError } from "bullmq"
import { z } from "zod"

export class ExpectedHeavyStepError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = "ExpectedHeavyStepError"
  }
}

const retryMetadataSchema = z.object({
  code: z.string().optional(),
  httpStatusCode: z.number().int().optional(),
  retryable: z.boolean().optional(),
  status: z.number().int().optional(),
  statusCode: z.number().int().optional(),
})

const transientCodes = new Set([
  "ABORT_ERR",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
])

/**
 * Unknown errors are retryable by default because they may represent a
 * provider/storage outage. Permanent user-input failures must use
 * ExpectedHeavyStepError or BullMQ's UnrecoverableError explicitly.
 */
export function isRetryableHeavyError(error: unknown): boolean {
  if (error instanceof ExpectedHeavyStepError) {
    return false
  }
  if (error instanceof UnrecoverableError) {
    return false
  }

  const metadata = retryMetadataSchema.safeParse(error).data
  if (metadata?.retryable !== undefined) {
    return metadata.retryable
  }

  const status =
    metadata?.status ?? metadata?.statusCode ?? metadata?.httpStatusCode
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500
  }

  return metadata?.code ? transientCodes.has(metadata.code.toUpperCase()) : true
}

export function isExpectedHeavyStepError(
  error: unknown,
): error is ExpectedHeavyStepError {
  return error instanceof ExpectedHeavyStepError
}
