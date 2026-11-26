import { SdkException, UNKNOWN_ERROR } from "./exception"
import type { ParsedError } from "./schemas"

export function guessFileTypeFromMimeType(mimeType: string) {
  const prefix = mimeType.split("/")[0]

  switch (prefix) {
    case "image":
    case "video":
    case "audio":
      return prefix
    default:
      return "file"
  }
}

export async function parseSdkError(
  error: Error | SdkException | unknown,
): Promise<ParsedError> {
  if (error instanceof SdkException) {
    return await error.getErrorData()
  }

  console.error("parseSdkError: Unknown error", error)

  return UNKNOWN_ERROR
}

/**
 * A page size the platform will accept: a whole number from 1 up to the
 * platform's own maximum. A caller-supplied `limit` is never trusted as is.
 */
export function clampPageSize(limit: number, max: number): number {
  const whole = Math.trunc(limit)
  return Number.isNaN(whole) ? 1 : Math.max(1, Math.min(whole, max))
}
