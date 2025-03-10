import type { Attachment } from "@ahachat.ai/database/browser"

export type AttachmentResource = Attachment & {
  url: string
}
