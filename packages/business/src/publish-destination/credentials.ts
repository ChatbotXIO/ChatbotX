import {
  type InboxIntegrationTable,
  type InboxPublishProvider,
  type PublishCredentialSource,
  publishCredentialRepository,
  publishDestinationRepository,
} from "@chatbotx.io/database/repositories"
import type { EncryptedData } from "@chatbotx.io/encryption"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import {
  derivePublishState,
  missingPublishScopes,
  PUBLISH_REQUIRED_SCOPES,
} from "@chatbotx.io/utils/publish-destination"
import type {
  PublisherKey,
  SocialPublishErrorCategory,
  SocialPublishFailed,
} from "@chatbotx.io/utils/social-publisher"
import { z } from "zod"
import { logger } from "../logger"
import { socialAccountService } from "../social-account/service"
import { announcePublishConnectionAttention } from "./notify-attention"

/**
 * The part of an inbox integration's `auth` the publish pipeline reads. The
 * three inbox integrations (Messenger, Instagram, Threads) store the token at
 * the same path, which is also the path the database fingerprint hashes.
 */
const inboxAuthSchema = z.object({
  tokens: z.object({ accessToken: z.string().min(1) }),
})

/** Codes of a destination that cannot even start a publish. */
export const publishBlockerCodes = z.enum([
  "inboxDisconnected",
  "inboxNeedsReconnect",
  "publishPermissionMissing",
  "accountNeedsReauth",
  "accountDisconnected",
  "destinationInactive",
  "accountNotConnected",
])
export type PublishBlockerCode = z.infer<typeof publishBlockerCodes>

/**
 * What a settle with an auth failure must be tied to: the exact token the
 * attempt used, so a reconnect that replaced it is never overridden.
 */
export type PublishCredentialFence =
  | {
      kind: "inbox"
      grantedScopes: string[] | null
      integrationId: string
      integrationTable: InboxIntegrationTable
      provider: InboxPublishProvider
      publishDestinationId: string
      /** sha256 (hex) of the access token the attempt read. */
      tokenFingerprint: string
    }
  | {
      kind: "socialAccount"
      /** The ciphertext the TikTok token was decrypted from. */
      ciphertext: EncryptedData
      socialAccountId: string
    }

/** The token and ids one publish call needs. Built per call, never stored, logged or returned by an API. */
export type PublishCredentials = {
  accessToken: string
  destinationExternalId: string
  fence: PublishCredentialFence
  publisherKey: PublisherKey
}

export type PublishCredentialsResult =
  | { credentials: PublishCredentials; ok: true }
  | { blocker: SocialPublishFailed; ok: false }

const blocked = (
  category: SocialPublishErrorCategory,
  code: PublishBlockerCode,
  message: string,
): PublishCredentialsResult => ({
  blocker: {
    category,
    code,
    message,
    provablyNotCreated: true,
    status: "failed",
  },
  ok: false,
})

const inboxBlocker = (
  source: Extract<PublishCredentialSource, { kind: "inbox" }>,
): PublishCredentialsResult | null => {
  const state = derivePublishState({
    grantedScopes: source.grantedScopes,
    inboxStatus: source.inboxStatus,
    publishStatus: source.publishStatus,
    publisherKey: source.publisherKey,
    tokenRefreshError: source.tokenRefreshError,
  })
  switch (state) {
    case "inboxDisconnected":
      return blocked(
        "authFailed",
        "inboxDisconnected",
        "The channel behind this destination is disconnected.",
      )
    case "needsReconnect":
      return blocked(
        "authFailed",
        "inboxNeedsReconnect",
        "The channel connection expired. Reconnect it before publishing.",
      )
    case "permissionMissing":
      return blocked(
        "authFailed",
        "publishPermissionMissing",
        "Publishing permission was not granted. Reconnect the channel to allow publishing.",
      )
    default:
      return null
  }
}

const loadInboxCredentials = async (
  source: Extract<PublishCredentialSource, { kind: "inbox" }>,
): Promise<PublishCredentialsResult> => {
  const stopped = inboxBlocker(source)
  if (stopped) {
    return stopped
  }
  const auth = inboxAuthSchema.safeParse(source.auth)
  if (!auth.success) {
    return blocked(
      "authFailed",
      "inboxNeedsReconnect",
      "The channel has no usable token. Reconnect it before publishing.",
    )
  }
  const { accessToken } = auth.data.tokens
  return {
    credentials: {
      accessToken,
      destinationExternalId: source.externalId,
      fence: {
        grantedScopes: source.grantedScopes,
        integrationId: source.integrationId,
        integrationTable: source.integrationTable,
        kind: "inbox",
        provider: source.provider,
        publishDestinationId: source.publishDestinationId,
        tokenFingerprint: await sha256Hex(accessToken),
      },
      publisherKey: source.publisherKey,
    },
    ok: true,
  }
}

const loadTiktokCredentials = async (
  source: Extract<PublishCredentialSource, { kind: "socialAccount" }>,
): Promise<PublishCredentialsResult> => {
  if (source.accountStatus !== "connected") {
    const code =
      source.accountStatus === "needsReauth"
        ? "accountNeedsReauth"
        : "accountDisconnected"
    return blocked(
      "authFailed",
      code,
      "The account must be reconnected before publishing.",
    )
  }
  if (!source.destinationActive) {
    return blocked(
      "notFound",
      "destinationInactive",
      "The platform no longer lists this page for the account.",
    )
  }
  const credentials = await socialAccountService.getCredentials({
    id: source.socialAccountId,
    workspaceId: source.workspaceId,
  })
  if (credentials?.status !== "connected") {
    return blocked(
      "authFailed",
      "accountNotConnected",
      "The account has no usable token.",
    )
  }
  const destination = credentials.destinations.find(
    (candidate) => candidate.id === source.socialAccountDestinationId,
  )
  return {
    credentials: {
      accessToken: destination?.accessToken ?? credentials.accessToken,
      destinationExternalId: source.externalId,
      fence: {
        ciphertext: credentials.accessTokenCiphertext,
        kind: "socialAccount",
        socialAccountId: source.socialAccountId,
      },
      publisherKey: "tiktok",
    },
    ok: true,
  }
}

/**
 * The credential for one publish call, or the typed reason there is none. One
 * repository read; every table in it is filtered by the workspace, so a
 * destination of another workspace is not found (reported as `notFound` /
 * `inboxDisconnected`).
 */
export const loadPublishCredentials = async (input: {
  publishDestinationId: string
  workspaceId: string
}): Promise<PublishCredentialsResult> => {
  const source = await publishCredentialRepository.findCredentialSource(input)
  if (!source) {
    return blocked(
      "notFound",
      "inboxDisconnected",
      "The destination is no longer available.",
    )
  }
  return source.kind === "inbox"
    ? await loadInboxCredentials(source)
    : await loadTiktokCredentials(source)
}

/** Why a publish failed on the auth side: a rejected token or a missing permission. */
export type PublishAuthFailureCategory = Extract<
  SocialPublishErrorCategory,
  "authFailed" | "permissionDenied"
>

/**
 * A publish call proved the credential is no good. Inbox destinations never
 * touch `Connection` (that disconnects the inbox and releases its quota):
 * - `authFailed` marks the integration `publishTokenRejected` (the existing
 *   reconnect prompt), only while it still holds the token the call used;
 * - `permissionDenied` records `permissionMissing` on the binding, with the
 *   same token condition.
 * TikTok keeps the social account status. Returns whether anything was written.
 */
export const recordPublishAuthFailure = async (input: {
  category: PublishAuthFailureCategory
  credentials: Pick<PublishCredentials, "fence" | "publisherKey">
  workspaceId: string
  now?: Date
}): Promise<boolean> => {
  const { fence } = input.credentials
  if (fence.kind === "socialAccount") {
    const account = {
      fence: { readAccessToken: fence.ciphertext },
      id: fence.socialAccountId,
      workspaceId: input.workspaceId,
    }
    // The service announces the transition (every path that flips the account does).
    if (input.category === "authFailed") {
      // An access token that only expired is renewed by the refresh scan, not a reconnect.
      return (
        (await socialAccountService.rejectAccessToken(account)) ===
        "needsReauth"
      )
    }
    return await socialAccountService.markNeedsReauth({
      ...account,
      reason: "permissionNotGranted",
    })
  }
  if (input.category === "authFailed") {
    const written = await publishCredentialRepository.markInboxTokenRejected({
      integrationId: fence.integrationId,
      provider: fence.provider,
      tokenFingerprint: fence.tokenFingerprint,
      workspaceId: input.workspaceId,
    })
    if (written) {
      logger.warn(
        { integrationId: fence.integrationId, provider: fence.provider },
        "publish: the channel token was rejected, reconnect required",
      )
      await announcePublishConnectionAttention({
        alert: "needsReconnect",
        publishDestinationId: fence.publishDestinationId,
        transitionKey: fence.tokenFingerprint,
        workspaceId: input.workspaceId,
      })
    }
    return written
  }
  const known = fence.grantedScopes
    ? missingPublishScopes(input.credentials.publisherKey, fence.grantedScopes)
    : []
  const written = await publishDestinationRepository.recordPermissionMissing({
    id: fence.publishDestinationId,
    missingScopes:
      known.length > 0
        ? known
        : [...PUBLISH_REQUIRED_SCOPES[input.credentials.publisherKey]],
    now: input.now ?? new Date(),
    provider: fence.provider,
    tokenFingerprint: fence.tokenFingerprint,
    workspaceId: input.workspaceId,
  })
  if (written) {
    await announcePublishConnectionAttention({
      alert: "permissionMissing",
      publishDestinationId: fence.publishDestinationId,
      transitionKey: fence.tokenFingerprint,
      workspaceId: input.workspaceId,
    })
  }
  return written
}

/** The continuation key the Instagram publishers write: the publisher that created the container. */
export const PUBLISH_CONTINUATION_VIA_KEY = "via"

/**
 * A container created through one Instagram flavour cannot be read through the
 * other (different graph host and token). True when the continuation names a
 * publisher that is not the destination's current one; a continuation without
 * the key predates the key and proceeds.
 */
export const continuationViaMismatch = (
  continuation: Record<string, unknown> | null,
  publisherKey: PublisherKey,
): boolean => {
  const via = continuation?.[PUBLISH_CONTINUATION_VIA_KEY]
  return typeof via === "string" && via !== publisherKey
}
