import type { SocialAccountCredentials } from "@chatbotx.io/business"
import {
  connectTiktokSocialAccount,
  generateTiktokPublishingAuthUrl,
  getTiktokUserInfo,
  refreshTiktokPublishingToken,
  revokeTiktokPublishingToken,
} from "@chatbotx.io/integration-tiktok/publisher-social-account"
import { ChannelError, ChannelErrorCategory } from "@chatbotx.io/sdk"
import type {
  ConnectedSocialAccount,
  ConnectedSocialDestination,
  SocialProvider,
} from "@chatbotx.io/utils/social-account"

/** A platform app's credentials, as the credential service resolves them. */
export type SocialProviderSettings = {
  clientId: string
  clientSecret: string
  version?: string
}

/** The networks that connect a social account. */
export type SocialAccountProvider = Extract<SocialProvider, "tiktok">

/** The platform app (`PlatformCredential` type) a network's connect uses. */
export type SocialCredentialType = "tiktokPublishing"

export type SocialAccountProviderAdapter = {
  /** The OAuth callback path registered with the platform app. */
  callbackPath: string
  /** Reads the identity, granted permissions and destinations from the platform. */
  connect: (input: {
    callbackUrl: string
    code: string
    settings: SocialProviderSettings
  }) => Promise<ConnectedSocialAccount>
  credentialType: SocialCredentialType
  generateAuthUrl: (input: {
    clientId: string
    redirectUrl: string
    stateParams: Record<string, unknown>
    version?: string
  }) => string
  /** Re-lists the destinations of a connected login; absent where the network has one profile. */
  listDestinations?: (
    credentials: SocialAccountCredentials,
  ) => Promise<ConnectedSocialDestination[]>
  provider: SocialAccountProvider
  /**
   * A new token for another validity period; absent where the token never needs
   * it. A network that rotates the refresh token returns the new one, which
   * replaces the stored one in the same write.
   */
  refreshToken?: (
    credentials: SocialAccountCredentials,
    settings: SocialProviderSettings | null,
  ) => Promise<{
    accessToken: string
    expiresAt: Date | null
    refreshToken?: string
  }>
  /** The refresh needs the platform app's client key and secret (resolved by the caller). */
  refreshUsesAppCredentials?: boolean
  /** Revokes the token at the platform on disconnect; best effort. */
  revoke?: (
    credentials: SocialAccountCredentials,
    settings: SocialProviderSettings,
  ) => Promise<void>
  /** The token is revoked, expired or lacks a permission: only a new login fixes it. */
  requiresReconnect: (error: unknown) => boolean
  /** Proves the token still works; returns the granted permissions when the platform reports them. */
  verify: (
    credentials: SocialAccountCredentials,
  ) => Promise<{ grantedScopes: string[] | null }>
}

const reconnectCategory = (error: ChannelError): boolean =>
  error.category === ChannelErrorCategory.AUTH_FAILED ||
  error.category === ChannelErrorCategory.PERMISSION_DENIED

/**
 * Social accounts are TikTok-only: Facebook, Instagram and Threads publish with
 * the token of the connected inbox (see the publish destination service).
 */
export const socialAccountProviders: Record<
  SocialAccountProvider,
  SocialAccountProviderAdapter
> = {
  tiktok: {
    callbackPath: "/integrations/tiktok/callback",
    connect: ({ callbackUrl, code, settings }) =>
      connectTiktokSocialAccount({ callbackUrl, code, settings }),
    credentialType: "tiktokPublishing",
    generateAuthUrl: generateTiktokPublishingAuthUrl,
    provider: "tiktok",
    refreshToken: async (credentials, settings) => {
      if (!(settings && credentials.refreshToken)) {
        throw new ChannelError(
          "No TikTok refresh token or app credentials to refresh with",
          ChannelErrorCategory.AUTH_FAILED,
        )
      }
      const tokens = await refreshTiktokPublishingToken(
        settings,
        credentials.refreshToken,
      )
      return {
        accessToken: tokens.accessToken,
        expiresAt: tokens.expiresAt,
        refreshToken: tokens.refreshToken,
      }
    },
    refreshUsesAppCredentials: true,
    requiresReconnect: (error) =>
      error instanceof ChannelError && reconnectCategory(error),
    revoke: (credentials, settings) =>
      revokeTiktokPublishingToken(settings, credentials.accessToken),
    verify: async (credentials) => {
      await getTiktokUserInfo(credentials.accessToken)
      return { grantedScopes: null }
    },
  },
}
