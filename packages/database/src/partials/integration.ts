import { z } from "zod"

export const integrationTypes = z.enum([
  "chatbotx",
  "claude",
  "deepseek",
  "gemini",
  "googleSheets",
  "instagram",
  "messenger",
  "openai",
  "smtp",
  "telegram",
  "tiktok",
  "webchat",
  "whatsapp",
  "zalo",
])
export type IntegrationType = z.infer<typeof integrationTypes>
