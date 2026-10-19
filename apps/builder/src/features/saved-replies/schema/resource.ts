import {
  createSelectSchema,
  savedReplyModel,
} from "@chatbotx.io/database/schema"
import { z } from "zod"

export const savedReplyImageResource = z.object({
  id: z.string(),
  mediaLibraryFileId: z
    .string()
    .describe(
      "Media library file id. Pass these as `mediaFileIds` to `messages.create` to send the images.",
    ),
  name: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  url: z.string().describe("Public URL of the image."),
})
export type SavedReplyImageResource = z.infer<typeof savedReplyImageResource>

export const savedReplyResource = createSelectSchema(savedReplyModel, {
  id: z.string(),
  workspaceId: z.string(),
}).extend({
  images: z
    .array(savedReplyImageResource)
    .describe("Images sent with the reply, in order."),
})
export type SavedReplyResource = z.infer<typeof savedReplyResource>
