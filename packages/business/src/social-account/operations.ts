import type { SocialTokenFence } from "@chatbotx.io/database/repositories"
import { queryCreatorInfo } from "@chatbotx.io/integration-tiktok/publisher-api"
import { withCache } from "@chatbotx.io/redis"
import {
  type ConnectedSocialDestination,
  missingSocialScopes,
  type SocialProvider,
} from "@chatbotx.io/utils/social-account"
import {
  ChatbotXException,
  conflictException,
  notFoundException,
} from "../errors"
import { resolveCredentialOwnerIdForWorkspace } from "../google-ads/owner"
import { logger } from "../logger"
import { platformCredentialService } from "../platform-credential/service"
import { publishDestinationService } from "../publish-destination/service"
import { publishingSettingsCacheKey } from "./publishing-settings-cache"
import { type SocialAccountCredentials, socialAccountService } from "./service"

/** What a destination's account allows right now; see `publishingSettings`. */
export type PublishingSettings = {
  canPostNow: boolean
  /** TikTok's error code when the creator cannot post now (`spam_risk_too_many_posts`, `reached_active_user_cap`, ...). */
  cannotPostReason: string | null
  commentDisabled: boolean
  creatorAvatarUrl: string | null
  creatorNickname: string | null
  creatorUsername: string | null
  duetDisabled: boolean
  maxVideoPostDurationSec: number | null
  privacyLevelOptions: string[]
  provider: SocialProvider
  stitchDisabled: boolean
}

/** A platform app's credentials, as the credential service resolves them. */
type ProviderSettings = {
  clientId: string
  clientSecret: string
  version?: string
}

/**
 * What the account operations need from a network's adapter. The registry in
 * `@chatbotx.io/channel-registry` (which depends on this package) owns the
 * adapters and passes them in, so no dependency points back at it.
 */
export type SocialAccountProviderPort = {
  credentialType: "tiktokPublishing"
  /** Re-lists the destinations of a connected login; absent where the network has one profile. */
  listDestinations?: (
    credentials: SocialAccountCredentials,
  ) => Promise<ConnectedSocialDestination[]>
  /** Revokes the token at the platform on disconnect; best effort. */
  revoke?: (
    credentials: SocialAccountCredentials,
    settings: ProviderSettings,
  ) => Promise<void>
  /** The token is revoked, expired or lacks a permission: only a new login fixes it. */
  requiresReconnect: (error: unknown) => boolean
  /** Proves the token still works; returns the granted permissions when the platform reports them. */
  verify: (
    credentials: SocialAccountCredentials,
  ) => Promise<{ grantedScopes: string[] | null }>
}

/** Social accounts are TikTok-only; the registry's map is passed in by the caller. */
export type SocialAccountPorts = Record<"tiktok", SocialAccountProviderPort>

type AccountRef = { id: string; workspaceId: string }

/** TikTok allows 20 creator-info reads a minute per token; a result is reused this long. */
const PUBLISHING_SETTINGS_CACHE_TTL_SECONDS = 30
/** While TikTok throttles the token, every read answers "unavailable" for this long without calling it again. */
const THROTTLE_MARKER_TTL_SECONDS = 30
const TIKTOK_THROTTLE_CODE = "rate_limit_exceeded"

type CachedPublishingSettings =
  | { kind: "settings"; settings: PublishingSettings }
  | { kind: "throttled" }

/** TikTok codes that say the creator cannot post now (not an outage or a throttle). */
const isCreatorRestriction = (code: string): boolean =>
  code.startsWith("spam_risk") || code === "reached_active_user_cap"

/** Social accounts are TikTok-only; any other stored provider is a data error. */
const tiktokOnly = (provider: SocialProvider): "tiktok" => {
  if (provider !== "tiktok") {
    // The table is TikTok-only (CHECK); anything else is not a social account.
    throw notFoundException("Social account not found")
  }
  return provider
}

/** A platform call failed for a reason that is not the account's token. */
const providerUnavailable = (): ChatbotXException =>
  new ChatbotXException(
    "The platform could not be reached. Try again shortly.",
    "providerUnavailable",
    502,
  )

const needsReauthException = (): ChatbotXException =>
  new ChatbotXException(
    "The platform rejected the account's token. Reconnect it from the Posts page.",
    "socialAccountNeedsReauth",
    409,
  )

const loadCredentials = async (input: AccountRef) => {
  const credentials = await socialAccountService.getCredentials(input)
  if (!credentials) {
    // Either not this workspace's account, or disconnected (no token to use).
    await socialAccountService.get(input)
    throw conflictException(
      "The account is disconnected. Connect it again from the Posts page.",
      "socialAccountDisconnected",
    )
  }
  return credentials
}

/**
 * A rejected token moves the account to `needsReauth` (409) while it is still
 * the stored one. A token that only expired while the account holds a refresh
 * token leaves the account connected for the refresh scan and answers like an
 * outage, so a late refresh never costs the person a reconnect.
 */
const rejectToken = async (
  account: AccountRef,
  fence: SocialTokenFence,
): Promise<never> => {
  const outcome = await socialAccountService.rejectAccessToken({
    ...account,
    fence,
  })
  if (outcome === "refreshPending") {
    throw providerUnavailable()
  }
  throw needsReauthException()
}

/**
 * A call the platform rejected for the token or a permission moves the account
 * to `needsReauth`; any other failure (network, rate limit) leaves it untouched
 * and is reported as unavailable.
 */
const handleProviderFailure = async (
  port: SocialAccountProviderPort,
  error: unknown,
  account: AccountRef,
  fence: SocialTokenFence,
): Promise<never> => {
  if (port.requiresReconnect(error)) {
    return await rejectToken(account, fence)
  }
  logger.warn(
    { err: error, accountId: account.id },
    "social account provider call failed",
  )
  throw providerUnavailable()
}

const unavailableSettings = (
  provider: SocialProvider,
  code: string,
): PublishingSettings => ({
  canPostNow: false,
  cannotPostReason: code,
  commentDisabled: true,
  creatorAvatarUrl: null,
  creatorNickname: null,
  creatorUsername: null,
  duetDisabled: true,
  maxVideoPostDurationSec: null,
  privacyLevelOptions: [],
  provider,
  stitchDisabled: true,
})

/**
 * Revokes the account's token at the platform. Everything here is best effort,
 * reading the credentials included: a token that cannot be decrypted (a lost
 * key, a malformed value) must not keep the person from disconnecting, which
 * wipes it.
 */
const revokeBestEffort = async (
  input: AccountRef,
  ports: SocialAccountPorts,
): Promise<void> => {
  try {
    const credentials = await socialAccountService.getCredentials(input)
    const port = credentials ? ports[tiktokOnly(credentials.provider)] : null
    if (!(credentials && port?.revoke)) {
      return
    }
    const settings = await platformCredentialService.resolveForOwner({
      ownerId: await resolveCredentialOwnerIdForWorkspace(input.workspaceId),
      type: port.credentialType,
    })
    if (settings) {
      await port.revoke(credentials, settings.config)
    }
  } catch (error) {
    logger.warn(
      { err: error, accountId: input.id },
      "social account token revoke failed; disconnecting anyway",
    )
  }
}

/** One read of TikTok's creator info for an account: settings, or a throttle marker; an outage throws. */
const readCreatorSettings = async (
  account: AccountRef,
): Promise<CachedPublishingSettings> => {
  const credentials = await loadCredentials(account)
  const outcome = await queryCreatorInfo(credentials.accessToken)
  if (outcome.ok) {
    const info = outcome.data
    return {
      kind: "settings",
      settings: {
        canPostNow: true,
        cannotPostReason: null,
        commentDisabled: info.commentDisabled,
        creatorAvatarUrl: info.avatarUrl,
        creatorNickname: info.nickname,
        creatorUsername: info.username,
        duetDisabled: info.duetDisabled,
        maxVideoPostDurationSec: info.maxVideoPostDurationSec,
        privacyLevelOptions: info.privacyLevelOptions,
        provider: credentials.provider,
        stitchDisabled: info.stitchDisabled,
      },
    }
  }
  const { category, code } = outcome.failure
  if (category === "authFailed" || category === "permissionDenied") {
    return await rejectToken(account, {
      readAccessToken: credentials.accessTokenCiphertext,
    })
  }
  if (isCreatorRestriction(code)) {
    return {
      kind: "settings",
      settings: unavailableSettings(credentials.provider, code),
    }
  }
  if (code === TIKTOK_THROTTLE_CODE) {
    return { kind: "throttled" }
  }
  // An outage says nothing about the creator: throw so nothing is cached and a
  // validation skips the target (the publisher checks again before posting).
  logger.warn(
    { accountId: account.id, code },
    "TikTok creator info could not be read",
  )
  throw providerUnavailable()
}

/** The operations the public API and the Posts page's session procedures share. */
export const socialAccountOperationService = {
  /**
   * Proves the stored token still works. A working token with every required
   * permission clears `needsReauth`; a missing permission or a rejected token sets it.
   */
  async verify(input: AccountRef, ports: SocialAccountPorts) {
    const credentials = await loadCredentials(input)
    const port = ports[tiktokOnly(credentials.provider)]
    const fence = { readAccessToken: credentials.accessTokenCiphertext }
    try {
      const { grantedScopes } = await port.verify(credentials)
      await socialAccountService.recordVerified({
        ...input,
        fence,
        grantedScopes,
      })
      const missing = grantedScopes
        ? missingSocialScopes(credentials.provider, grantedScopes)
        : []
      if (missing.length > 0) {
        await socialAccountService.markNeedsReauth({
          ...input,
          fence,
          reason: "permissionNotGranted",
        })
      } else if (credentials.status === "needsReauth") {
        await socialAccountService.markConnected({ ...input, fence })
      }
    } catch (error) {
      await handleProviderFailure(port, error, input, fence)
    }
    return await socialAccountService.get(input)
  },

  /**
   * Re-lists the Pages of a connected login from the platform. Networks whose
   * login owns one profile have nothing to re-list and answer with the account.
   */
  async syncDestinations(input: AccountRef, ports: SocialAccountPorts) {
    const credentials = await loadCredentials(input)
    const port = ports[tiktokOnly(credentials.provider)]
    if (!port.listDestinations) {
      return await socialAccountService.get(input)
    }
    const fence = { readAccessToken: credentials.accessTokenCiphertext }
    try {
      const destinations = await port.listDestinations(credentials)
      return await socialAccountService.replaceDestinations({
        ...input,
        destinations,
        fence,
      })
    } catch (error) {
      return await handleProviderFailure(port, error, input, fence)
    }
  },

  /**
   * Disconnects locally; where the platform documents a revoke call (TikTok) the
   * token is revoked first, best effort: a revoke that fails never blocks the
   * disconnect, and the token is wiped either way.
   */
  async disconnect(input: AccountRef, ports: SocialAccountPorts) {
    await revokeBestEffort(input, ports)
    await socialAccountService.disconnect(input)
  },

  /**
   * What a publish destination's account allows right now (TikTok: the
   * creator's privacy options, interaction switches and longest video), read
   * live because TikTok requires the latest creator info on the export screen
   * and before posting. Only TikTok destinations have any.
   */
  async publishingSettings(input: {
    destinationId: string
    workspaceId: string
  }): Promise<PublishingSettings> {
    const destination = await publishDestinationService.get({
      id: input.destinationId,
      workspaceId: input.workspaceId,
    })
    if (destination.provider !== "tiktok" || !destination.socialAccountId) {
      throw new ChatbotXException(
        "This network has no publishing settings to read.",
        "publishingSettingsNotSupported",
        422,
      )
    }
    const account = {
      id: destination.socialAccountId,
      workspaceId: input.workspaceId,
    }
    const cached = await withCache<CachedPublishingSettings>(
      publishingSettingsCacheKey({
        accountId: account.id,
        workspaceId: account.workspaceId,
      }),
      async () => await readCreatorSettings(account),
      {
        ttl: PUBLISHING_SETTINGS_CACHE_TTL_SECONDS,
        ttlFor: (result) =>
          result.kind === "throttled" ? THROTTLE_MARKER_TTL_SECONDS : undefined,
      },
    )
    if (cached.kind === "throttled") {
      throw providerUnavailable()
    }
    return cached.settings
  },
}
