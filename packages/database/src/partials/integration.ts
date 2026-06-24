import { z } from "zod"

export const integrationTypes = z.enum([
  "activeCampaign",
  "chatbotx",
  "claude",
  "deepseek",
  "drip",
  "gemini",
  "getResponse",
  "klaviyo",
  "googleSheets",
  "instagram",
  "mailchimp",
  "mailerLite",
  "messenger",
  "moosend",
  "openai",
  "openrouter",
  "sendGrid",
  "smtp",
  "telegram",
  "tiktok",
  "webchat",
  "whatsapp",
  "zalo",
])
export type IntegrationType = z.infer<typeof integrationTypes>
