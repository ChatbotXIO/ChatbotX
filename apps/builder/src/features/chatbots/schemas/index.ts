import { z } from "zod"

export const chatbotIdBindSchema: [chatbotId: z.ZodString] = [
  z.string().cuid2(),
]
export type ChatbotIdBindSchema = [chatbotId: string]
