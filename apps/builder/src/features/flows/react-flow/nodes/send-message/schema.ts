import { z } from "zod"
import { textBlockSchema } from "../../blocks/text/schema"

export const sendMessageNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  messageType: z.enum(["Messenger", "Whatsapp", "Chatwidget"]),
  blocks: z.array(z.union([
    textBlockSchema,
    // imageBlockSchema,
    z.undefined()
    // cardBlockSchema,
    // carouselBlockSchema
  ]))
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>
