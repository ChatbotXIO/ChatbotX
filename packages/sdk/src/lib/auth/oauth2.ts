import type { AuthType, BaseAuthValue } from "./base"

export type Oauth2Config = {
  clientId: string
  clientSecret: string
  redirectUrl: string
  version?: string
  verifyToken?: string
  stateParams?: Record<string, unknown>
}

export type TokenAuthValue = {
  accessToken: string
  expiresAt?: string
  refreshToken?: string | null
  refreshTokenExpiresAt?: string | null
}

export type Oauth2AuthValue = BaseAuthValue & {
  authType: typeof AuthType.OAUTH2
  clientId: string
  clientSecret: string
  redirectUrl: string
  verifyToken?: string
  tokens: TokenAuthValue
  metadata?: Record<string, unknown>
}
