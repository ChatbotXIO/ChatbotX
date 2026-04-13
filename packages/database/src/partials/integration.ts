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
  "smtp",
])
export type IntegrationType = z.infer<typeof integrationTypes>
