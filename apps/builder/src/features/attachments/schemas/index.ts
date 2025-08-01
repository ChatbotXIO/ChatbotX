import type { AttachmentModel } from "@aha.chat/database/types"

export type AttachmentResource = AttachmentModel & {
  url: string
}
