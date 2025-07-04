import type { AttachmentModel } from "@ahachat.ai/database/types"

export type AttachmentResource = AttachmentModel & {
  url: string
}
