import {
  attachmentModel,
  createSelectSchema,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const attachmentResource = createSelectSchema(attachmentModel, {
  id: z.string(),
}).and(
  z.object({
    url: z.url(),
  }),
)
export type AttachmentResource = z.infer<typeof attachmentResource>
