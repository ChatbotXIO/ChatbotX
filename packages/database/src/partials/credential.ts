import { z } from "zod"

export const credentialTypes = z.enum([
  "whatsapp",
  "messenger",
  "instagram",
  "google",
  "zalo",
  "giphy",
  "stripe",
  "paddle",
])
export type CredentialType = z.infer<typeof credentialTypes>

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
  connectClientId: z.string().optional(),
})
export type StripeCredential = z.infer<typeof stripeCredentialSchema>

export const stripeCredentialPublicSchema = stripeCredentialSchema.pick({
  publishableKey: true,
  verifyToken: true,
  connectClientId: true,
})
export type StripeCredentialPublic = z.infer<
  typeof stripeCredentialPublicSchema
>

export const paddleCredentialSchema = z.object({
  vendorId: z.string(),
  vendorAuthCode: z.string(),
  publicKey: z.string().optional(),
  verifyToken: z.string().optional(),
})
export type PaddleCredential = z.infer<typeof paddleCredentialSchema>

export const paddleCredentialPublicSchema = paddleCredentialSchema.pick({
  vendorId: true,
})
export type PaddleCredentialPublic = z.infer<
  typeof paddleCredentialPublicSchema
>

export const credentialSchemas = {
  whatsapp: whatsappCredentialSchema,
  messenger: messengerCredentialSchema,
  instagram: instagramCredentialSchema,
  google: googleCredentialSchema,
  zalo: zaloCredentialSchema,
  giphy: giphyCredentialSchema,
  stripe: stripeCredentialSchema,
  paddle: paddleCredentialSchema,
} as const

export const credentialPublicSchemas = {
  whatsapp: whatsappCredentialPublicSchema,
  messenger: messengerCredentialPublicSchema,
  instagram: instagramCredentialPublicSchema,
  google: googleCredentialPublicSchema,
  zalo: zaloCredentialPublicSchema,
  giphy: giphyCredentialPublicSchema,
  stripe: stripeCredentialPublicSchema,
  paddle: paddleCredentialPublicSchema,
} as const

export type CredentialByType = {
  whatsapp: WhatsappCredential
  messenger: MessengerCredential
  instagram: InstagramCredential
  google: GoogleCredential
  zalo: ZaloCredential
  giphy: GiphyCredential
  stripe: StripeCredential
  paddle: PaddleCredential
}

export type CredentialPublicByType = {
  whatsapp: WhatsappCredentialPublic
  messenger: MessengerCredentialPublic
  instagram: InstagramCredentialPublic
  google: GoogleCredentialPublic
  zalo: ZaloCredentialPublic
  giphy: GiphyCredentialPublic
  stripe: StripeCredentialPublic
  paddle: PaddleCredentialPublic
}

// ─── Update schemas (secrets optional — empty means "keep current") ─────────

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

// ─── Encrypted blob shape stored in Credential.value ─────────────────────────

export const credentialEncryptedSchema = z.object({
  v: z.literal(1),
  kid: z.string().optional(),
  iv: z.string(),
  text: z.string(),
  tag: z.string(),
})
export type CredentialEncrypted = z.infer<typeof credentialEncryptedSchema>
