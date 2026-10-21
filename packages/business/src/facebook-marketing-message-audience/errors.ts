import { ChatbotXException } from "../errors"

/**
 * Codes the builder maps to translated messages. The exception `message` is
 * the code itself — never shown raw; `data` carries interpolation params.
 */
export const AUDIENCE_ERROR_CODES = [
  "audienceInvalidFile",
  "audienceTooManyRows",
  "audienceNoIdentifier",
  "audienceNoValidRows",
  "audiencePartialUpload",
  "audienceNotFound",
  "audienceCreateRejected",
  "audienceInUse",
] as const

export type AudienceErrorCode = (typeof AUDIENCE_ERROR_CODES)[number]

export function audienceError(
  code: AudienceErrorCode,
  data?: Record<string, string | number>,
): ChatbotXException {
  const error = new ChatbotXException(code, code)
  if (data) {
    error.data = data
  }
  return error
}

export function isAudienceError(
  error: unknown,
): error is ChatbotXException & { code: AudienceErrorCode } {
  return (
    error instanceof ChatbotXException &&
    (AUDIENCE_ERROR_CODES as readonly string[]).includes(error.code)
  )
}
