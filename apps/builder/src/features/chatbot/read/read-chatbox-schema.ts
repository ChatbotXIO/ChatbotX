import { z } from "zod"

export const readChatbotSchema = z.object({
  id: z.string().cuid2(),
});

export type ReadChatbotSchema = z.infer<typeof readChatbotSchema>

export const ReadChatbotSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type ReadChatbotBindSchema = [chatbotId: string]
