import { attachmentModel, createSelectSchema } from "@aha.chat/database/schema"
import type { AttachmentModel } from "@aha.chat/database/types"
import { z } from "zod"
import { logger } from "@/lib/log"

export const attachmentResource = createSelectSchema(attachmentModel).and(
  z.object({
    url: z.url(),
  }),
)
export type AttachmentResource = z.infer<typeof attachmentResource>

export function getAttachmentUrl(attachment: AttachmentModel) {
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
