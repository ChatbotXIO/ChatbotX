import { z } from "zod"

export const organizationCredentialTypes = z.enum([
  "whatsapp",
  "messenger",
  "instagram",
  "google",
  "zalo",
  "giphy",
  "stripe",
])
export type OrganizationCredentialType = z.infer<
  typeof organizationCredentialTypes
>

// ─── Per-provider full credential schemas (every field, public + secret) ─────
// `value` stores the full object encrypted. `publicConfig` is a `.pick()`
// projection of the same fields that are safe to read without decrypting.

export const whatsappCredentialSchema = z.object({
  clientId: z.string(),
  version: z.string(),
  configId: z.string(),
  systemUserId: z.string(),
  businessId: z.string().optional(),
  businessName: z.string(),
  verifyToken: z.string(),
  clientSecret: z.string(),
  systemUserToken: z.string(),
})
export type WhatsappCredential = z.infer<typeof whatsappCredentialSchema>

export const whatsappCredentialPublicSchema = whatsappCredentialSchema.pick({
  clientId: true,
  version: true,
  configId: true,
  systemUserId: true,
  businessId: true,
  businessName: true,
  verifyToken: true,
})
export type WhatsappCredentialPublic = z.infer<
  typeof whatsappCredentialPublicSchema
>

export const messengerCredentialSchema = z.object({
  clientId: z.string(),
  version: z.string(),
  verifyToken: z.string(),
  clientSecret: z.string(),
})
export type MessengerCredential = z.infer<typeof messengerCredentialSchema>

export const messengerCredentialPublicSchema = messengerCredentialSchema.pick({
  clientId: true,
  version: true,
  verifyToken: true,
})
export type MessengerCredentialPublic = z.infer<
  typeof messengerCredentialPublicSchema
>

export const instagramCredentialSchema = z.object({
  clientId: z.string(),
  version: z.string(),
  verifyToken: z.string(),
  clientSecret: z.string(),
})
export type InstagramCredential = z.infer<typeof instagramCredentialSchema>

export const instagramCredentialPublicSchema = instagramCredentialSchema.pick({
  clientId: true,
  version: true,
  verifyToken: true,
})
export type InstagramCredentialPublic = z.infer<
  typeof instagramCredentialPublicSchema
>

export const googleCredentialSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string(),
  verifyToken: z.string(),
})
export type GoogleCredential = z.infer<typeof googleCredentialSchema>

export const googleCredentialPublicSchema = googleCredentialSchema.pick({
  clientId: true,
})
export type GoogleCredentialPublic = z.infer<
  typeof googleCredentialPublicSchema
>

export const zaloCredentialSchema = z.object({
  clientId: z.string(),
  version: z.string(),
  verifyToken: z.string(),
  clientSecret: z.string(),
})
export type ZaloCredential = z.infer<typeof zaloCredentialSchema>

export const zaloCredentialPublicSchema = zaloCredentialSchema.pick({
  clientId: true,
  version: true,
  verifyToken: true,
})
export type ZaloCredentialPublic = z.infer<typeof zaloCredentialPublicSchema>

export const giphyCredentialSchema = z.object({
  apiKey: z.string(),
})
export type GiphyCredential = z.infer<typeof giphyCredentialSchema>

export const giphyCredentialPublicSchema = giphyCredentialSchema.pick({})
export type GiphyCredentialPublic = z.infer<typeof giphyCredentialPublicSchema>

export const stripeCredentialSchema = z.object({
  publishableKey: z.string(),
  verifyToken: z.string(),
  secretKey: z.string(),
})
export type StripeCredential = z.infer<typeof stripeCredentialSchema>

export const stripeCredentialPublicSchema = stripeCredentialSchema.pick({
  publishableKey: true,
  verifyToken: true,
})
export type StripeCredentialPublic = z.infer<
  typeof stripeCredentialPublicSchema
>

export const organizationCredentialSchemas = {
  whatsapp: whatsappCredentialSchema,
  messenger: messengerCredentialSchema,
  instagram: instagramCredentialSchema,
  google: googleCredentialSchema,
  zalo: zaloCredentialSchema,
  giphy: giphyCredentialSchema,
  stripe: stripeCredentialSchema,
} as const

export const organizationCredentialPublicSchemas = {
  whatsapp: whatsappCredentialPublicSchema,
  messenger: messengerCredentialPublicSchema,
  instagram: instagramCredentialPublicSchema,
  google: googleCredentialPublicSchema,
  zalo: zaloCredentialPublicSchema,
  giphy: giphyCredentialPublicSchema,
  stripe: stripeCredentialPublicSchema,
} as const

export type OrganizationCredentialByType = {
  whatsapp: WhatsappCredential
  messenger: MessengerCredential
  instagram: InstagramCredential
  google: GoogleCredential
  zalo: ZaloCredential
  giphy: GiphyCredential
  stripe: StripeCredential
}

export type OrganizationCredentialPublicByType = {
  whatsapp: WhatsappCredentialPublic
  messenger: MessengerCredentialPublic
  instagram: InstagramCredentialPublic
  google: GoogleCredentialPublic
  zalo: ZaloCredentialPublic
  giphy: GiphyCredentialPublic
  stripe: StripeCredentialPublic
}

// ─── Update schemas (secrets optional — empty means "keep current") ─────────
// Used by edit forms and update actions. Every field is trimmed at parse time
// so "   " collapses to "" and the merge logic in each action can rely on
// truthiness alone (no per-call .trim() needed). The action merges submitted
// non-empty secrets over the existing decrypted config server-side; secrets
// never round-trip through the browser.

export const whatsappCredentialUpdateSchema = z.object({
  clientId: z.string().trim(),
  version: z.string().trim(),
  configId: z.string().trim(),
  systemUserId: z.string().trim(),
  businessId: z.string().trim().optional(),
  businessName: z.string().trim(),
  verifyToken: z.string().trim(),
  clientSecret: z.string().trim().optional(),
  systemUserToken: z.string().trim().optional(),
})
export type WhatsappCredentialUpdate = z.infer<
  typeof whatsappCredentialUpdateSchema
>

export const messengerCredentialUpdateSchema = z.object({
  clientId: z.string().trim(),
  version: z.string().trim(),
  verifyToken: z.string().trim(),
  clientSecret: z.string().trim().optional(),
})
export type MessengerCredentialUpdate = z.infer<
  typeof messengerCredentialUpdateSchema
>

export const instagramCredentialUpdateSchema = z.object({
  clientId: z.string().trim(),
  version: z.string().trim(),
  verifyToken: z.string().trim(),
  clientSecret: z.string().trim().optional(),
})
export type InstagramCredentialUpdate = z.infer<
  typeof instagramCredentialUpdateSchema
>

export const googleCredentialUpdateSchema = z.object({
  clientId: z.string().trim(),
  clientSecret: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
})
export type GoogleCredentialUpdate = z.infer<
  typeof googleCredentialUpdateSchema
>

export const zaloCredentialUpdateSchema = z.object({
  clientId: z.string().trim(),
  version: z.string().trim(),
  verifyToken: z.string().trim(),
  clientSecret: z.string().trim().optional(),
})
export type ZaloCredentialUpdate = z.infer<typeof zaloCredentialUpdateSchema>

export const giphyCredentialUpdateSchema = z.object({
  apiKey: z.string().trim().optional(),
})
export type GiphyCredentialUpdate = z.infer<typeof giphyCredentialUpdateSchema>

export const stripeCredentialUpdateSchema = z.object({
  publishableKey: z.string().trim(),
  verifyToken: z.string().trim(),
  secretKey: z.string().trim().optional(),
})
export type StripeCredentialUpdate = z.infer<
  typeof stripeCredentialUpdateSchema
>

// ─── Encrypted blob shape stored in OrganizationCredential.value ─────────────

export const organizationCredentialEncryptedSchema = z.object({
  v: z.literal(1),
  kid: z.string().optional(),
  iv: z.string(),
  text: z.string(),
  tag: z.string(),
})
export type OrganizationCredentialEncrypted = z.infer<
  typeof organizationCredentialEncryptedSchema
>
