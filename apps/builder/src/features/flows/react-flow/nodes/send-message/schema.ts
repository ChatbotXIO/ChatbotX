import { z } from "zod"
import { sendTextBlockSchema } from "../../blocks/send-text/schema"

export const sendMessageNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  messageType: z.enum(["Messenger", "Whatsapp", "Chatwidget"]),
  blocks: z.array(z.union([
    sendTextBlockSchema,
    // imageBlockSchema,
    z.undefined()
    // cardBlockSchema,
    // carouselBlockSchema
  ]))
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>
