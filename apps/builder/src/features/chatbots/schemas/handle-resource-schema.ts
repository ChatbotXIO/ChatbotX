import { z } from "zod"

export const chatbotBindSchema: [chatbotId: z.ZodString] = [z.string().cuid2()]
export type ChatbotBindSchema = [chatbotId: string]
