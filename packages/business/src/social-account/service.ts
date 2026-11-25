import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type SocialAccountStatus,
  type SocialAccountStatusReason,
  type SocialDestinationKind,
  type SocialProvider,
  socialAccountAad,
  socialDestinationAad,
} from "@chatbotx.io/database/partials"
import {
  publishDestinationRepository,
  type SocialDestinationIdentityInput,
  type SocialTokenFence,
  socialAccountRepository,
} from "@chatbotx.io/database/repositories"
import type { EncryptedData } from "@chatbotx.io/encryption"
import { encryptUtils, isMalformedEncryptedData } from "@chatbotx.io/encryption"
import { createId } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import {
  type ConnectedSocialAccount,
  type ConnectedSocialDestination,
  MAX_SOCIAL_DESTINATIONS_PER_ACCOUNT,
  missingSocialScopes,
  SOCIAL_PROVIDER_CAPABILITIES,
} from "@chatbotx.io/utils/social-account"
import { z } from "zod"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"
import { announcePublishConnectionAttention } from "../publish-destination/notify-attention"
import { type SocialAccountDto, toSocialAccountDto } from "./dto"
import { invalidatePublishingSettings } from "./publishing-settings-cache"

/** Error code of a connect whose dialog did not grant every permission publishing needs. */
export const SOCIAL_PERMISSION_NOT_GRANTED_CODE = "permissionNotGranted"

/**
 * A stored token whose value cannot even be parsed: an unparsable payload
 * (`SyntaxError`), one that is not a token envelope (`ZodError`) or a malformed
 * encrypted blob (`isMalformedEncryptedData`). It never succeeds on retry; the
 * account needs a reconnect. Decryption failures (`SocialTokenDecryptionError`),
 * key configuration problems and database errors are not this error.
 */
export class SocialTokenUnreadableError extends Error {
  constructor(cause: unknown) {
    super("The stored social account token cannot be decrypted", { cause })
    this.name = "SocialTokenUnreadableError"
  }
}

/**
 * Web Crypto refused to decrypt the token (`OperationError`): corrupt
 * ciphertext, or a wrong key that still carries the active key id. The two
 * cannot be told apart, so it is transient: the account keeps its status and
 * a bad key deployment never flags accounts for reconnect.
 */
export class SocialTokenDecryptionError extends Error {
  constructor(cause: unknown) {
    super("The stored social account token could not be decrypted", { cause })
    this.name = "SocialTokenDecryptionError"
  }
}

const isMalformedTokenError = (err: unknown): boolean =>
  err instanceof SyntaxError ||
  err instanceof z.ZodError ||
  isMalformedEncryptedData(err)

const isDecryptionFailure = (err: unknown): boolean =>
  err instanceof Error && err.name === "OperationError"

const tokenEnvelope = z.object({ token: z.string().min(1) })

const encryptToken = (token: string, aad: string) =>
  encryptUtils.encryptObject({ token }, aad)

const decryptToken = async (
  blob: Parameters<typeof encryptUtils.decryptObject>[0],
  aad: string,
): Promise<string> => {
  try {
    return (await encryptUtils.decryptObject(blob, tokenEnvelope, aad)).token
  } catch (err) {
    if (isMalformedTokenError(err)) {
      throw new SocialTokenUnreadableError(err)
    }
    if (isDecryptionFailure(err)) {
      throw new SocialTokenDecryptionError(err)
    }
    throw err
  }
}

/** `null` for an absent token (a falsy value), the encrypted envelope otherwise. */
const encryptOptional = async (
  token: string | null | undefined,
  aad: string,
): Promise<Awaited<ReturnType<typeof encryptToken>> | null> =>
  token ? await encryptToken(token, aad) : null

/** `null` for an absent blob, the decrypted token otherwise. */
const decryptOptional = async (
  blob: Parameters<typeof decryptToken>[0] | null,
  aad: string,
): Promise<string | null> => (blob ? await decryptToken(blob, aad) : null)

export const socialPermissionNotGrantedException = (
  missing: string[],
): ChatbotXException => {
  const exception = new ChatbotXException(
    `The connection did not grant: ${missing.join(", ")}`,
    SOCIAL_PERMISSION_NOT_GRANTED_CODE,
    422,
  )
  exception.data = { permissions: missing.join(", ") }
  return exception
}

/**
 * The decrypted credentials of one account, for a provider call only. It is
 * built per call, never stored or returned by an API.
 */
export type SocialAccountCredentials = {
  accessToken: string
  /**
   * The ciphertext the token was decrypted from. A change that follows the
   * provider call presents it back (`SocialTokenFence`), so it never overrides a
   * newer connect or refresh.
   */
  accessTokenCiphertext: EncryptedData
  destinations: {
    accessToken: string | null
    externalId: string
    id: string
    isActive: boolean
    kind: SocialDestinationKind
  }[]
  id: string
  provider: SocialProvider
  refreshToken: string | null
  status: SocialAccountStatus
  tokenExpiresAt: Date | null
  workspaceId: string
}

/**
 * What became of a token the platform rejected: `refreshPending` when it only
 * expired (the account stays connected and the refresh scan renews it),
 * `needsReauth` when the account now waits for a reconnect, `unchanged` when
 * the token was no longer the stored one.
 */
export type AccessTokenRejection =
  | "refreshPending"
  | "needsReauth"
  | "unchanged"

export type ConnectSocialAccountInput = {
  account: ConnectedSocialAccount
  /** The member who pressed Connect. */
  connectedById: string
  workspaceId: string
}

/** Most accounts one scan refreshes, so one tick stays short. */
export const SOCIAL_TOKEN_REFRESH_BATCH = 25
/** How long before expiry a token is refreshed (tokens live 60 days). */
export const SOCIAL_TOKEN_REFRESH_LEAD_MS = 14 * 24 * 60 * 60 * 1000
/**
 * Networks whose access token lives hours, not weeks (TikTok: the response's
 * `expires_in`, 2 hours in the docs): they are refreshed when it expires within
 * this window instead of the two-week lead.
 */
export const SOCIAL_SHORT_LIVED_PROVIDERS: readonly SocialProvider[] = [
  "tiktok",
]
export const SOCIAL_SHORT_LIVED_REFRESH_LEAD_MS = 30 * 60 * 1000
/** How long a refresh holds the row; also the wait before a transient failure is retried. */
export const SOCIAL_TOKEN_REFRESH_LEASE_MS = 15 * 60 * 1000

class SocialAccountService extends BaseService {
  async list(workspaceId: string): Promise<SocialAccountDto[]> {
    const accounts = await socialAccountRepository.list(workspaceId)
    const destinations = await socialAccountRepository.listDestinations({
      accountIds: accounts.map((account) => account.id),
      workspaceId,
    })
    return accounts.map((account) =>
      toSocialAccountDto(
        account,
        destinations.filter(
          (destination) => destination.socialAccountId === account.id,
        ),
      ),
    )
  }

  async get(input: {
    id: string
    workspaceId: string
  }): Promise<SocialAccountDto> {
    const account = await socialAccountRepository.findForWorkspace(input)
    if (!account) {
      throw notFoundException("Social account not found")
    }
    const destinations = await socialAccountRepository.listDestinations({
      accountIds: [account.id],
      workspaceId: input.workspaceId,
    })
    return toSocialAccountDto(account, destinations)
  }

  /**
   * Stores a freshly connected login: one transaction that upserts the account
   * (a reconnect of the same login keeps its row and id), binds its tokens to
   * that id, merges the destinations by `externalId` and deactivates the ones the
   * platform no longer lists. Refuses, writing nothing, when the platform did not
   * grant every permission publishing needs.
   */
  async connect(input: ConnectSocialAccountInput): Promise<SocialAccountDto> {
    const { account, workspaceId } = input
    if (!SOCIAL_PROVIDER_CAPABILITIES[account.provider].connectSupported) {
      throw new ChatbotXException(
        "This network cannot be connected yet",
        "providerNotSupported",
        422,
      )
    }
    const missing = missingSocialScopes(account.provider, account.grantedScopes)
    if (missing.length > 0) {
      throw socialPermissionNotGrantedException(missing)
    }

    const id = await db.transaction(async (tx) => {
      const existingId = await socialAccountRepository.findIdByExternalAccount(
        {
          externalAccountId: account.externalAccountId,
          provider: account.provider,
          workspaceId,
        },
        tx,
      )
      const accountId = await socialAccountRepository.upsertIdentity(
        {
          avatar: account.avatar,
          connectedById: input.connectedById,
          displayName: account.displayName,
          externalAccountId: account.externalAccountId,
          grantedScopes: account.grantedScopes,
          id: existingId ?? createId(),
          provider: account.provider,
          statusReason: null,
          tokenExpiresAt: account.tokenExpiresAt,
          username: account.username,
          workspaceId,
        },
        tx,
      )
      // The id a concurrent connect won the insert with, not the one generated
      // above, is what the tokens are bound to.
      const aad = socialAccountAad(workspaceId, accountId)
      await socialAccountRepository.saveTokens(
        {
          accessToken: await encryptToken(account.accessToken, aad),
          id: accountId,
          refreshToken: await encryptOptional(account.refreshToken, aad),
          workspaceId,
        },
        tx,
      )
      await this.writeDestinations(
        { accountId, destinations: account.destinations, workspaceId },
        tx,
      )
      return accountId
    })

    // New tokens: a throttle marker or a "cannot post" read with the old token
    // must not be served for the rest of its 30 seconds.
    await invalidatePublishingSettings({ accountId: id, workspaceId })
    return await this.get({ id, workspaceId })
  }

  /**
   * Re-lists the destinations of an account from the platform's own answer.
   * The write happens only while the account is still `connected` with the
   * token the list was fetched with (checked under a row lock in the same
   * transaction); after a disconnect, reconnect or refresh meanwhile nothing is
   * written, so wiped Page tokens are never restored from a stale answer.
   */
  async replaceDestinations(input: {
    destinations: ConnectedSocialDestination[]
    fence: SocialTokenFence
    id: string
    workspaceId: string
  }): Promise<SocialAccountDto> {
    const account = await socialAccountRepository.findForWorkspace({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    if (!account) {
      throw notFoundException("Social account not found")
    }
    await db.transaction(async (tx) => {
      const current = await socialAccountRepository.lockConnectedForSync(
        {
          fence: input.fence,
          id: input.id,
          workspaceId: input.workspaceId,
        },
        tx,
      )
      if (!current) {
        return
      }
      await this.writeDestinations(
        {
          accountId: input.id,
          destinations: input.destinations,
          workspaceId: input.workspaceId,
        },
        tx,
      )
    })
    return await this.get({ id: input.id, workspaceId: input.workspaceId })
  }

  /**
   * The decrypted credentials for a provider call. `null` for an account that is
   * gone or holds no token (disconnected). Never expose the result through an API.
   */
  async getCredentials(input: {
    id: string
    workspaceId: string
  }): Promise<SocialAccountCredentials | null> {
    const row = await socialAccountRepository.findTokens(input)
    if (!row?.accessToken) {
      return null
    }
    const aad = socialAccountAad(row.workspaceId, row.id)
    const destinations = await socialAccountRepository.listDestinationTokens({
      socialAccountId: row.id,
      workspaceId: row.workspaceId,
    })
    return {
      accessToken: await decryptToken(row.accessToken, aad),
      accessTokenCiphertext: row.accessToken,
      destinations: await Promise.all(
        destinations.map(async (destination) => ({
          accessToken: await decryptOptional(
            destination.accessToken,
            socialDestinationAad(row.workspaceId, destination.id),
          ),
          externalId: destination.externalId,
          id: destination.id,
          isActive: destination.isActive,
          kind: destination.kind,
        })),
      ),
      id: row.id,
      provider: row.provider,
      refreshToken: await decryptOptional(row.refreshToken, aad),
      status: row.status,
      tokenExpiresAt: row.tokenExpiresAt,
      workspaceId: row.workspaceId,
    }
  }

  async recordVerified(input: {
    fence?: SocialTokenFence
    grantedScopes: string[] | null
    id: string
    workspaceId: string
  }): Promise<void> {
    await socialAccountRepository.recordVerified({
      ...input,
      now: new Date(),
    })
  }

  /**
   * The token or a permission is gone: the account waits for a reconnect. Never
   * touches a disconnected account; with a `fence`, only while the token that was
   * read is still the stored one (a reconnect meanwhile makes this a no-op).
   */
  async markNeedsReauth(input: {
    fence?: SocialTokenFence
    id: string
    reason: SocialAccountStatusReason
    workspaceId: string
  }): Promise<boolean> {
    const changed = await socialAccountRepository.setStatus({
      fence: input.fence,
      id: input.id,
      reason: input.reason,
      status: "needsReauth",
      workspaceId: input.workspaceId,
    })
    if (changed) {
      await invalidatePublishingSettings({
        accountId: input.id,
        workspaceId: input.workspaceId,
      })
      await announcePublishConnectionAttention({
        alert:
          input.reason === "permissionNotGranted"
            ? "permissionMissing"
            : "needsReconnect",
        socialAccountId: input.id,
        // The same rejected token announces once; without a fence it is time.
        transitionKey: input.fence
          ? await sha256Hex(JSON.stringify(input.fence.readAccessToken))
          : String(Date.now()),
        workspaceId: input.workspaceId,
      })
    }
    return changed
  }

  /**
   * The platform rejected the account's access token. An access token that has
   * only expired (its stored expiry has passed) while the account still holds a
   * refresh token is not a lost login: the account stays connected and the
   * minute refresh scan (which claims expired tokens) renews it, and only a
   * refresh the platform rejects sets `needsReauth`. Any other rejection (a
   * revoked token, an unknown expiry, no refresh token) is `needsReauth` at once.
   */
  async rejectAccessToken(input: {
    fence: SocialTokenFence
    id: string
    workspaceId: string
  }): Promise<AccessTokenRejection> {
    const row = await socialAccountRepository.findTokens({
      id: input.id,
      workspaceId: input.workspaceId,
    })
    const expiredButRefreshable =
      row?.status === "connected" &&
      row.refreshToken !== null &&
      row.tokenExpiresAt !== null &&
      row.tokenExpiresAt.getTime() <= Date.now()
    if (expiredButRefreshable) {
      return "refreshPending"
    }
    const changed = await this.markNeedsReauth({
      ...input,
      reason: "tokenRejected",
    })
    return changed ? "needsReauth" : "unchanged"
  }

  /**
   * A claimed account whose token cannot be decrypted needs a reconnect. Fenced
   * on the claim's lease (the token is unreadable, so it cannot be the fence):
   * a reconnect or disconnect meanwhile makes this a no-op.
   */
  async markNeedsReauthUnreadable(input: {
    id: string
    leaseUntil: Date
    workspaceId: string
  }): Promise<boolean> {
    const changed = await socialAccountRepository.setNeedsReauthUnderLease({
      id: input.id,
      leaseUntil: input.leaseUntil,
      reason: "refreshRejected",
      workspaceId: input.workspaceId,
    })
    if (changed) {
      await invalidatePublishingSettings({
        accountId: input.id,
        workspaceId: input.workspaceId,
      })
      await announcePublishConnectionAttention({
        alert: "needsReconnect",
        socialAccountId: input.id,
        transitionKey: String(input.leaseUntil.getTime()),
        workspaceId: input.workspaceId,
      })
    }
    return changed
  }

  /** The token works again (a verify succeeded): the account publishes. */
  async markConnected(input: {
    fence?: SocialTokenFence
    id: string
    workspaceId: string
  }): Promise<boolean> {
    const changed = await socialAccountRepository.setStatus({
      fence: input.fence,
      id: input.id,
      reason: null,
      status: "connected",
      workspaceId: input.workspaceId,
    })
    if (changed) {
      await invalidatePublishingSettings({
        accountId: input.id,
        workspaceId: input.workspaceId,
      })
    }
    return changed
  }

  /** Wipes the tokens and marks the account disconnected; the row stays for history. */
  async disconnect(input: { id: string; workspaceId: string }): Promise<void> {
    const done = await db.transaction(
      async (tx) => await socialAccountRepository.disconnect(input, tx),
    )
    if (!done) {
      throw notFoundException("Social account not found")
    }
    await invalidatePublishingSettings({
      accountId: input.id,
      workspaceId: input.workspaceId,
    })
    await this.audit("update", "disconnected a social account")
  }

  /** Accounts whose token expires soon, each claimed with a lease for one refresh. */
  async claimDueForRefresh(input: {
    limit?: number
    now?: Date
    providers: SocialProvider[]
  }) {
    const now = input.now ?? new Date()
    const limit = input.limit ?? SOCIAL_TOKEN_REFRESH_BATCH
    const claim = (
      providers: SocialProvider[],
      leadMs: number,
      claimLimit: number,
    ) =>
      socialAccountRepository.claimDueForRefresh({
        expiresBefore: new Date(now.getTime() + leadMs),
        leaseUntil: new Date(now.getTime() + SOCIAL_TOKEN_REFRESH_LEASE_MS),
        limit: claimLimit,
        now,
        providers,
      })
    const isShortLived = (provider: SocialProvider) =>
      SOCIAL_SHORT_LIVED_PROVIDERS.includes(provider)
    const longLived = input.providers.filter((p) => !isShortLived(p))
    const shortLived = input.providers.filter(isShortLived)
    const claimed =
      longLived.length > 0
        ? await claim(longLived, SOCIAL_TOKEN_REFRESH_LEAD_MS, limit)
        : []
    // One limit across both claims: the worker refreshes serially and a lease
    // must outlast the whole batch.
    const remaining = limit - claimed.length
    if (shortLived.length === 0 || remaining <= 0) {
      return claimed
    }
    return [
      ...claimed,
      ...(await claim(
        shortLived,
        SOCIAL_SHORT_LIVED_REFRESH_LEAD_MS,
        remaining,
      )),
    ]
  }

  /**
   * Stores a refreshed account token (bound to the row) and releases the lease,
   * only while the worker's claim still holds (`false` otherwise: it must stop
   * quietly, a newer owner of the row decides what happens next).
   */
  async applyRefreshedToken(input: {
    accessToken: string
    fence: Required<SocialTokenFence>
    id: string
    /** The rotated refresh token of a network that issues a new one on every refresh. */
    refreshToken?: string
    tokenExpiresAt: Date | null
    workspaceId: string
  }): Promise<boolean> {
    const aad = socialAccountAad(input.workspaceId, input.id)
    const applied = await socialAccountRepository.applyRefreshedToken({
      accessToken: await encryptToken(input.accessToken, aad),
      refreshToken:
        (await encryptOptional(input.refreshToken, aad)) ?? undefined,
      fence: input.fence,
      id: input.id,
      tokenExpiresAt: input.tokenExpiresAt,
      workspaceId: input.workspaceId,
    })
    if (applied) {
      await invalidatePublishingSettings({
        accountId: input.id,
        workspaceId: input.workspaceId,
      })
    }
    return applied
  }

  /** A transient refresh failure: keep the lease so the row is retried later, not every minute. */
  async deferRefresh(input: {
    fence: Required<SocialTokenFence>
    id: string
    retryAt: Date
    workspaceId: string
  }): Promise<boolean> {
    return await socialAccountRepository.deferRefresh(input)
  }

  /**
   * Like `deferRefresh` for a token that could not be read (so there is no
   * token to present): fenced on the claimed lease alone.
   */
  async deferRefreshUnderLease(input: {
    id: string
    leaseUntil: Date
    retryAt: Date
    workspaceId: string
  }): Promise<boolean> {
    return await socialAccountRepository.deferRefreshUnderLease(input)
  }

  private async writeDestinations(
    input: {
      accountId: string
      destinations: ConnectedSocialDestination[]
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    const { accountId, workspaceId } = input
    // Active destinations first, so the cap never drops a Page the person can use.
    const destinations = [...input.destinations]
      .sort((first, second) => Number(second.isActive) - Number(first.isActive))
      .slice(0, MAX_SOCIAL_DESTINATIONS_PER_ACCOUNT)
    const now = new Date()
    const identities: SocialDestinationIdentityInput[] = destinations.map(
      (destination) => ({
        avatar: destination.avatar,
        externalId: destination.externalId,
        id: createId(),
        isActive: destination.isActive,
        kind: destination.kind,
        name: destination.name,
        username: destination.username,
      }),
    )
    const stored = await socialAccountRepository.upsertDestinations(
      {
        destinations: identities,
        now,
        socialAccountId: accountId,
        workspaceId,
      },
      tx,
    )
    const idByExternalId = new Map(
      stored.map((row) => [row.externalId, row.id]),
    )
    const tokens = await Promise.all(
      destinations.map(async (destination) => {
        const id = idByExternalId.get(destination.externalId)
        if (!id) {
          return null
        }
        const token = destination.isActive ? destination.accessToken : null
        return {
          id,
          token: await encryptOptional(
            token,
            socialDestinationAad(workspaceId, id),
          ),
        }
      }),
    )
    await socialAccountRepository.saveDestinationTokens(
      {
        tokens: tokens.filter(
          (token): token is NonNullable<typeof token> => token !== null,
        ),
        workspaceId,
      },
      tx,
    )
    await socialAccountRepository.deactivateMissingDestinations(
      {
        keepExternalIds: destinations.map(
          (destination) => destination.externalId,
        ),
        now,
        socialAccountId: accountId,
        workspaceId,
      },
      tx,
    )
    // TikTok destinations publish through a binding row; create it with the destination.
    await publishDestinationRepository.ensureForTiktokDestinations(
      { socialAccountDestinationIds: stored.map((row) => row.id), workspaceId },
      tx,
    )
  }
}

export const socialAccountService = new SocialAccountService()
