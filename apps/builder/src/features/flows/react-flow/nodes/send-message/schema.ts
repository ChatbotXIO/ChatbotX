import { z } from "zod"
import { textBlockSchema } from "@/features/flows/react-flow/blocks/text/schema"
import { imageBlockSchema } from "@/features/flows/react-flow/blocks/image/schema";
import { cardBlockSchema } from "@/features/flows/react-flow/blocks/card/schema";
import { videoBlockSchema } from "@/features/flows/react-flow/blocks/video/schema";
import { audioBlockSchema } from "@/features/flows/react-flow/blocks/audio/schema";
import { carouselGroupBlockSchema } from "@/features/flows/react-flow/blocks/carousel/schema";

export const sendMessageNodeSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(255).trim(),
  messageType: z.enum(["Messenger", "Whatsapp", "Chatwidget"]),
  blocks: z.array(z.union([
    textBlockSchema,
    imageBlockSchema,
    cardBlockSchema,
    videoBlockSchema,
    audioBlockSchema,
    carouselGroupBlockSchema,
  ]))
})
export type SendMessageNodeSchema = z.infer<typeof sendMessageNodeSchema>
