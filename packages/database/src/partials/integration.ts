import { z } from "zod"

export const integrationTypes = z.enum([
  "webchat",
  "googleSheets",
  "messenger",
  "openai",
  "gemini",
  "whatsapp",
  "zalo",
  "chatbotx",
])
export type IntegrationType = z.infer<typeof integrationTypes>
