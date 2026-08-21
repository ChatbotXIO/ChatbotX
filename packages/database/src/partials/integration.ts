import { z } from "zod"

export const integrationTypes = z.enum([
  "activeCampaign",
  "chatbotx",
  "claude",
  "deepseek",
  "drip",
  "facebookAds",
  "gemini",
  "getResponse",
  "klaviyo",
  "googleCalendar",
  "googleSheets",
  "instagram",
  "instagramFacebook",
  "mailchimp",
  "mailerLite",
  "metaCatalog",
  "messenger",
  "moosend",
  "openai",
  "openaiCompatible",
  "openrouter",
  "outlookCalendar",
  "sendGrid",
  "smtp",
  "telegram",
  "tiktok",
  "webchat",
  "whatsapp",
  "zalo",
])
export type IntegrationType = z.infer<typeof integrationTypes>

// Facebook/Instagram user who authorized the channel connection. `avatar` is a
// storage path (uploaded copy of the provider's profile picture), not the
// provider URL.
export const integrationUserInfoSchema = z.object({
  userId: z.string().min(1),
  userName: z.string(),
  userAccessToken: z.string().min(1),
  avatar: z.string().optional(),
})
export type IntegrationUserInfo = z.infer<typeof integrationUserInfoSchema>
