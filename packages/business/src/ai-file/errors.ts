import { AI_FILE_MAX_UPLOAD_BYTES } from "@chatbotx.io/sdk"
import { ChatbotXException } from "../errors"

/** Why creating an AI File was refused; stable, safe to branch on. */
const aiFileCreateErrorReasons = [
  "invalidUrl",
  "urlNotAllowed",
  "googleFileNotPublic",
  "googlePublishedNotSupported",
  "unsupportedFileType",
  "fileTooLarge",
  "downloadTimedOut",
  "downloadFailed",
  "tooManyRedirects",
  "invalidRedirect",
  "uploadPathNotAllowed",
] as const

export type AIFileCreateErrorReason = (typeof aiFileCreateErrorReasons)[number]

const reasonSet: ReadonlySet<string> = new Set(aiFileCreateErrorReasons)

export const isAIFileCreateErrorReason = (
  value: string | undefined,
): value is AIFileCreateErrorReason =>
  value !== undefined && reasonSet.has(value)

/**
 * A caller-fault AI File create failure. Same `businessError`/400 and English
 * message as before, so the public API contract is unchanged; `reason` (and
 * `maxBytes` for `fileTooLarge`) ride on their own fields rather than `data`,
 * which the oRPC error mapper would fold into the message. Server actions read
 * them to show a translated message.
 */
export class AIFileCreateException extends ChatbotXException {
  readonly reason: AIFileCreateErrorReason
  readonly maxBytes?: number

  constructor(message: string, reason: AIFileCreateErrorReason) {
    super(message, "businessError", 400)
    this.reason = reason
    if (reason === "fileTooLarge") {
      this.maxBytes = AI_FILE_MAX_UPLOAD_BYTES
    }
  }
}
