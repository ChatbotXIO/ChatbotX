import type { Attachment } from "@ahachat.ai/database/types"

export type AttachmentResource = Attachment & {
  url: string
}
