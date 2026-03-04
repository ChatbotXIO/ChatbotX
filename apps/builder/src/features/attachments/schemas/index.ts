import type { AttachmentModel } from "@aha.chat/database/types"
import { logger } from "@/lib/log"

export type AttachmentResource = AttachmentModel

export function getAttachmentUrl(attachment: AttachmentResource) {
  try {
    return new URL(
      attachment.originPath,
      process.env.NEXT_PUBLIC_ASSET_URL,
    ).toString()
  } catch (error) {
    logger.error(error, "Error getting attachment URL")
    return ""
  }
}
