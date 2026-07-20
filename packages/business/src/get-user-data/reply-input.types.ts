import type { ContentType, FileType } from "@chatbotx.io/database/partials"

export interface ReplyInputAttachment {
  fileType: FileType
  originPath: string
}

export interface ReplyInputMessage {
  attachments: readonly ReplyInputAttachment[]
  contentAttributes?: Record<string, unknown> | null
  contentType: ContentType
  text?: string | null
}

// How the accepted value was sourced. Attachments yield a storage key that the
// caller must turn into a public URL; text/location values are stored as-is.
export type ReplyInputKind = "text" | "attachment" | "location"

export type ReplyValidationResult =
  | { ok: true; userInput: string; kind: ReplyInputKind }
  | { ok: false; errorMessage: string }

export type ReplyValidator = (
  message: ReplyInputMessage,
) => ReplyValidationResult

export type TextCheck = (text: string) => ReplyValidationResult
