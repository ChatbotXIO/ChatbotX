import { z } from "zod"

export const organizationMemberRoles = z.enum(["owner", "admin", "member"])
export type OrganizationMemberRole = z.infer<typeof organizationMemberRoles>

/**
 * @deprecated Use OrganizationCredential (type="whatsapp") via
 * `organizationCredentialService` from `@chatbotx.io/business`. Kept while reads
 * still fall back to Organization.settings during dual-write.
 */
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

/**
 * @deprecated Use OrganizationCredential (type="google") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const googleSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
})
export type GoogleSettingsSchema = z.infer<typeof googleSettingsSchema>

/**
 * @deprecated Use OrganizationCredential (type="messenger") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const messengerSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
})
export type MessengerSettingsSchema = z.infer<typeof messengerSettingsSchema>

/**
 * @deprecated Use OrganizationCredential (type="instagram") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const instagramSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
})
export type InstagramSettingsSchema = z.infer<typeof instagramSettingsSchema>

/**
 * @deprecated Use OrganizationCredential (type="zalo") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const zaloSettingsSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
  version: z.string(),
})
export type ZaloSettingsSchema = z.infer<typeof zaloSettingsSchema>

/**
 * @deprecated Use OrganizationCredential (type="giphy") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const giphySettingsSchema = z.object({
  apiKey: z.string(),
})
export type GiphySettingsSchema = z.infer<typeof giphySettingsSchema>

/**
 * @deprecated Use OrganizationCredential (type="stripe") via
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const stripeSettingsSchema = z.object({
  publishableKey: z.string(),
  secretKey: z.string(),
  verifyToken: z.string(),
})
export type StripeSettingsSchema = z.infer<typeof stripeSettingsSchema>

/**
 * @deprecated Provider credentials are migrating to the OrganizationCredential
 * table. New code should not read or write these fields directly; use
 * `organizationCredentialService` from `@chatbotx.io/business`.
 */
export const organizationSettingsSchema = z.object({
  whatsapp: whatsappSettingsSchema.optional(),
  messenger: messengerSettingsSchema.optional(),
  instagram: instagramSettingsSchema.optional(),
  google: googleSettingsSchema.optional(),
  zalo: zaloSettingsSchema.optional(),
  giphy: giphySettingsSchema.optional(),
  stripe: stripeSettingsSchema.optional(),
})
export type OrganizationSettings = z.infer<typeof organizationSettingsSchema>
