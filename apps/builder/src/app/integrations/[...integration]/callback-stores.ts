import {
  facebookMarketingMessagesService,
  instagramIntegrationService,
  integrationFacebookAdsService,
  integrationMetaCatalogService,
  integrationWhatsappService,
  messagingAdsConnectionService,
  messengerIntegrationService,
} from "@chatbotx.io/business"
import type { MessagingAdChannel } from "@chatbotx.io/database/partials"
import {
  exchangeCodeForToken as exchangeFacebookAdsCode,
  exchangeLongLivedToken as exchangeFacebookAdsLongLivedToken,
  type FacebookAdsAuthValue,
} from "@chatbotx.io/integration-facebook-ads"
import {
  type FacebookUser,
  getFacebookUser as getMessengerFacebookUser,
} from "@chatbotx.io/integration-messenger"
import type { MetaCatalogAuthValue } from "@chatbotx.io/integration-meta-catalog/schemas"
import { AuthType } from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"

// Exchange the OAuth code for a long-lived Facebook Ads token and store it
// (encrypted) for the workspace. Shared by the Messenger-callback dispatch and
// the dedicated facebook-ads callback case.
export const storeFacebookAdsConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null

  const facebookAdsAuth: FacebookAdsAuthValue = {
    authType: AuthType.custom,
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await integrationFacebookAdsService.upsert({
    workspaceId: args.workspaceId,
    auth: facebookAdsAuth,
    tokenExpiresAt,
  })
}

// Exchange the OAuth code for a long-lived token and store it (encrypted) as
// the workspace's Marketing Messages grant. Deliberately does NOT reuse
// `storeFacebookAdsConnection`: that writes `IntegrationFacebookAds`, the
// workspace-wide Ads connection, whose token is granted with a different
// permission set and must not be overwritten by a Marketing Messages grant.
export const storeMarketingMessagesConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null

  // Best-effort: the grant must succeed even when the identity lookup fails,
  // which is why `facebookUserId` is nullable on the row.
  const fbUser = await lookupFacebookUser(() =>
    getMessengerFacebookUser(accessToken, args.credentialConfig.version),
  )

  const auth: FacebookAdsAuthValue = {
    authType: AuthType.custom,
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await facebookMarketingMessagesService.upsertAuth({
    workspaceId: args.workspaceId,
    auth,
    tokenExpiresAt,
    facebookUserId: fbUser?.id,
  })
}

/**
 * Verifies `messagingAdsIntegrationId` is a REAL channel integration that
 * belongs to `workspaceId` and matches `channel` before any token is stored
 * — the OAuth callback is an API boundary, so a forged/stale integration id
 * (or a channel mismatch) must never be trusted (v3 correction, "callback
 * ownership check"). Returns `false` on any mismatch; callers fall back to
 * `notFound()`.
 */
export const messagingAdsIntegrationBelongsToWorkspace = async (args: {
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}): Promise<boolean> => {
  const ref = { id: args.integrationId, workspaceId: args.workspaceId }
  if (args.channel === "whatsapp") {
    return Boolean(await integrationWhatsappService.findByIdForWorkspace(ref))
  }
  if (args.channel === "messenger") {
    return Boolean(await messengerIntegrationService.findByIdForWorkspace(ref))
  }
  return Boolean(await instagramIntegrationService.findByIdForWorkspace(ref))
}

// Exchange the OAuth code for a long-lived Facebook Ads token and store it
// (encrypted) on the per-integration `MessagingAdsConnection` row — the
// per-box counterpart to `storeFacebookAdsConnection` below. Deliberately
// does NOT reuse `integrationFacebookAdsService`/`storeFacebookAdsConnection`
// — those write the workspace-wide `IntegrationFacebookAds` table, which is
// the WRONG table for a per-integration box connection (v3 correction #4).
export const storeMessagingAdsConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
  channel: MessagingAdChannel
  integrationId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null

  const facebookAdsAuth: FacebookAdsAuthValue = {
    authType: AuthType.custom,
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await messagingAdsConnectionService.upsertFromOAuth({
    workspaceId: args.workspaceId,
    channel: args.channel,
    integrationId: args.integrationId,
    auth: facebookAdsAuth,
  })
}

export const storeMetaCatalogConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null
  const auth: MetaCatalogAuthValue = {
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await integrationMetaCatalogService.upsert({
    workspaceId: args.workspaceId,
    auth,
    tokenExpiresAt,
  })
}

// Best-effort: the connect flow works without the user identity, so a failed
// lookup only leaves `userInfo` unset on the integration row.
const lookupFacebookUser = async (
  fetchUser: () => Promise<FacebookUser>,
): Promise<FacebookUser | undefined> => {
  try {
    return await fetchUser()
  } catch (error) {
    logger.info({ err: error }, "Failed to fetch Facebook user profile")
    return
  }
}
