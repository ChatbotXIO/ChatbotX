import { resolveGenericOAuthConfig } from "@chatbotx.io/auth"
import { hasEnterpriseFeatures } from "@chatbotx.io/business"
import { env } from "@/env"

export type GenericOAuthButton = {
  displayName: string
  logoUrl?: string
}

/** The IdP button to render, or `null` when unconfigured or unlicensed. */
export const resolveGenericOAuthButton =
  async (): Promise<GenericOAuthButton | null> => {
    if (!(resolveGenericOAuthConfig() && (await hasEnterpriseFeatures()))) {
      return null
    }

    return {
      displayName: env.NEXT_PUBLIC_AUTH_OAUTH_DISPLAY_NAME ?? "SSO",
      logoUrl: env.NEXT_PUBLIC_AUTH_OAUTH_LOGO_URL,
    }
  }
