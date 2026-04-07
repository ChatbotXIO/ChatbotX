import { z } from "zod"

export const integrationTypes = z.enum([
  "chatbotx",
  "gemini",
  "googleSheets",
  "instagram",
  "messenger",
  "openai",
  "smtp",
  "telegram",
  "webchat",
  "whatsapp",
  "zalo",
])
export type IntegrationType = z.infer<typeof integrationTypes>
