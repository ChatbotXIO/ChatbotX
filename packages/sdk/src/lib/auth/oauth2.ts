import type { AuthType, BaseAuthValue } from "./base"

export type Oauth2AuthProps = {
  clientId: string
  clientSecret: string
  redirectUri: string
  code?: string
  stateParams?: Record<string, unknown>
}

export type TokenAuthValue = {
  accessToken: string
  expiresAt?: string
  refreshToken?: string | null
  refreshTokenExpiresAt?: string | null
}

export type Oauth2AuthValue = BaseAuthValue & {
  authType: AuthType.OAUTH2
  clientId: string
  clientSecret: string
  redirectUri: string
  webhookVerifyToken?: string
  tokens: TokenAuthValue
  metadata?: Record<string, unknown>
}
