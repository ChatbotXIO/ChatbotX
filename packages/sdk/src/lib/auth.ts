import { z } from "zod"

export enum AuthType {
  BASIC_AUTH = "BASIC_AUTH",
  OAUTH2 = "OAUTH2",
  SECRET_TEXT = "SECRET_TEXT",
}

export enum OAuth2GrantType {
  AUTHORIZATION_CODE = "authorization_code",
  CLIENT_CREDENTIALS = "client_credentials",
}

export type Oauth2PropsSchema = {
  clientId: string
  clientSecret: string
  redirectUri: string
  code?: string
  stateParams?: Record<string, unknown>
  callbackParams?: Record<string, unknown>
  tokens?: TokenAuthSchema
}

const baseAuthSchema = z.object({
  authType: z.nativeEnum(AuthType),
  issuedAt: z.string().datetime(),
})

export const tokenAuthSchema = baseAuthSchema.extend({
  accessToken: z.string(),
  expiresAt: z.string().datetime(),
  refreshToken: z.string().nullable(),
  refreshTokenExpiresAt: z.string().datetime().nullable(),
})
export type TokenAuthSchema = z.infer<typeof tokenAuthSchema>

export const secretTextAuthSchema = baseAuthSchema.extend({
  secretText: z.string(),
})
export type SecretTextAuthSchema = z.infer<typeof secretTextAuthSchema>

export type AuthSchema = TokenAuthSchema | SecretTextAuthSchema
