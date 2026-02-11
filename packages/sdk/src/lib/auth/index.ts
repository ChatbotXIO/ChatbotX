import { z } from "zod"

export const AuthType = {
  none: "none",
  basicAuth: "basicAuth",
  oauth2: "oauth2",
  secretText: "secretText",
  custom: "custom",
} as const
export type AuthType = (typeof AuthType)[keyof typeof AuthType]

export const noneAuthSchema = z.object({
  authType: z.literal(AuthType.none),
})
export type NoneAuthConfig = z.infer<typeof noneAuthSchema>

export type Oauth2Config = {
  clientId: string
  clientSecret: string
  redirectUrl: string
  version?: string
  verifyToken?: string
  stateParams?: Record<string, unknown>
}

export const oauth2AuthSchema = z.object({
  authType: z.literal(AuthType.oauth2),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  redirectUrl: z.string().trim().min(1),
  version: z.string().trim().optional(),
  verifyToken: z.string().trim().optional(),
  tokens: z.object({
    accessToken: z.string().trim().min(1),
    expiresAt: z.string().trim().optional(),
    refreshToken: z.string().trim().nullish(),
    refreshTokenExpiresAt: z.string().trim().nullish(),
  }),
  metadata: z.record(z.string().trim().min(1), z.unknown()).optional(),
})
export type Oauth2AuthValue = z.infer<typeof oauth2AuthSchema>

export const secretTextAuthSchema = z.object({
  authType: z.literal(AuthType.secretText),
  secretText: z.string().trim().min(1),
})
export type SecretTextAuthValue = z.infer<typeof secretTextAuthSchema>

export const customAuthSchema = z.object({
  authType: z.literal(AuthType.custom),
})
export type CustomAuthValue = z.infer<typeof customAuthSchema>

const authValueSchema = z.discriminatedUnion("authType", [
  noneAuthSchema,
  oauth2AuthSchema,
  secretTextAuthSchema,
  customAuthSchema,
])
export type AuthValue = z.infer<typeof authValueSchema>
