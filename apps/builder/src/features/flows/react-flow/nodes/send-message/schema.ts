import { sendAudioBlockSchema } from "@/features/flows/react-flow/blocks/send-audio/schema"
import { sendCardBlockSchema } from "@/features/flows/react-flow/blocks/send-card/schema"
import { sendCarouselBlockSchema } from "@/features/flows/react-flow/blocks/send-carousel/schema"
import { sendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { sendTextBlockSchema } from "@/features/flows/react-flow/blocks/send-text/schema"
import { sendVideoBlockSchema } from "@/features/flows/react-flow/blocks/send-video/schema"
import { z } from "zod"

export const sendMessageNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  messageType: z.enum(["Messenger", "Whatsapp", "Chatwidget"]),
  blocks: z.array(
    z.union([
      sendTextBlockSchema,
      sendImageBlockSchema,
      sendCardBlockSchema,
      sendVideoBlockSchema,
      sendAudioBlockSchema,
      sendCarouselBlockSchema,
    ]),
  ),
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>
