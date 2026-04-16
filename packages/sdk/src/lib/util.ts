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
