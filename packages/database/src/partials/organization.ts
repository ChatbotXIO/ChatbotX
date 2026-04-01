import { z } from "zod"

export const whatsappSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
  configId: z.string(),
  systemUserId: z.string(),
  systemUserToken: z.string(),
  businessId: z.string().optional(),
  businessName: z.string(),
})
export type WhatsappSettingsSchema = z.infer<typeof whatsappSettingsSchema>

export const googleSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
})
export type GoogleSettingsSchema = z.infer<typeof googleSettingsSchema>

export const messengerSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
})
export type MessengerSettingsSchema = z.infer<typeof messengerSettingsSchema>

export const zaloSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
})
export type ZaloSettingsSchema = z.infer<typeof zaloSettingsSchema>

export const giphySettingsSchema = z.object({
  apiKey: z.string(),
})
export type GiphySettingsSchema = z.infer<typeof giphySettingsSchema>

export const stripeSettingsSchema = z.object({
  publishableKey: z.string(),
  secretKey: z.string(),
  verifyToken: z.string(),
})
export type StripeSettingsSchema = z.infer<typeof stripeSettingsSchema>

export const organizationSettingsSchema = z.object({
  whatsapp: whatsappSettingsSchema.optional(),
  messenger: messengerSettingsSchema.optional(),
  google: googleSettingsSchema.optional(),
  zalo: zaloSettingsSchema.optional(),
  giphy: giphySettingsSchema.optional(),
  stripe: stripeSettingsSchema.optional(),
})
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>
