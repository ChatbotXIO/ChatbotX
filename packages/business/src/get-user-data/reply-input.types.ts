import type { ContentType, FileType } from "@chatbotx.io/database/partials"

export interface ReplyInputAttachment {
  fileType: FileType
  // Present on stored rows: identifies the attachment so a lazily-ingested one
  // (a provider URL in `originPath`) can be stored before its value is used.
  id?: string
  messageCreatedAt?: Date
  originPath: string
}

export interface ReplyAttachmentRef {
  id: string
  messageCreatedAt: Date
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
  | {
      ok: true
      userInput: string
      kind: ReplyInputKind
      attachment?: ReplyAttachmentRef
    }
  | { ok: false; errorMessage: string }

export type ReplyValidator = (
  message: ReplyInputMessage,
) => ReplyValidationResult

export type TextCheck = (text: string) => ReplyValidationResult
