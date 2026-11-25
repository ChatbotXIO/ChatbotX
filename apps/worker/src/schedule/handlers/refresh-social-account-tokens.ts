import {
  platformCredentialService,
  resolveCredentialOwnerIdForWorkspace,
  SocialTokenDecryptionError,
  SocialTokenUnreadableError,
  socialAccountService,
  withBlockedOwnerGuard,
} from "@chatbotx.io/business"
import {
  type SocialAccountProviderAdapter,
  socialAccountProviders,
} from "@chatbotx.io/channel-registry/social-account"
import { getChildLogger } from "@chatbotx.io/logger"
import {
  distributedLock,
  distributedStore,
  isLockAcquisitionError,
} from "@chatbotx.io/redis"

const LOCK_KEY = "schedule:refresh-social-account-tokens"
const LOCK_TIMEOUT_SECONDS = 50
const LOCK_ACQUIRE_RETRY_SECONDS = 5
/** Wait before a transient failure is retried. */
const RETRY_DELAY_MS = 30 * 60 * 1000

const log = getChildLogger("refresh-social-account-tokens")

/** The networks whose adapter can refresh a token; the scan claims only these. */
const refreshableProviders = () =>
  Object.values(socialAccountProviders)
    .filter((adapter) => adapter.refreshToken)
    .map((adapter) => adapter.provider)

type AdapterCredentialType = SocialAccountProviderAdapter["credentialType"]

/** The owner's current app client key and secret for a network, or null. */
const resolveAppSettings = async (
  workspaceId: string,
  type: AdapterCredentialType,
) => {
  const credential = await platformCredentialService.resolveForOwner({
    ownerId: await resolveCredentialOwnerIdForWorkspace(workspaceId),
    type,
  })
  return credential?.config ?? null
}

/**
 * Refreshes one claimed account's token. A token the platform rejects, or one
 * already expired (a refresh needs an unexpired token), moves the account to
 * `needsReauth`; any other failure keeps the lease so the account is retried
 * later instead of every minute.
 *
 * Every write presents the claim: the lease this worker took and the token it
 * read. A reconnect, a disconnect or another worker's later claim (after this
 * lease expired) changes one of them, so the write does nothing and this run
 * stops quietly.
 */
const refreshOne = async (account: {
  id: string
  leaseUntil: Date
  workspaceId: string
}): Promise<void> => {
  const ref = { id: account.id, workspaceId: account.workspaceId }
  let credentials: Awaited<
    ReturnType<typeof socialAccountService.getCredentials>
  >
  try {
    credentials = await socialAccountService.getCredentials(ref)
  } catch (err) {
    if (err instanceof SocialTokenDecryptionError) {
      // Corrupt ciphertext and a wrong key look the same, so the status is left
      // alone (a bad key deployment never flags accounts). The account is
      // deferred so it does not spin every tick.
      log.error(
        { err, accountId: account.id },
        "refreshSocialAccountTokens: credentials could not be decrypted, retrying later",
      )
      await socialAccountService.deferRefreshUnderLease({
        ...ref,
        leaseUntil: account.leaseUntil,
        retryAt: new Date(Date.now() + RETRY_DELAY_MS),
      })
      return
    }
    if (!(err instanceof SocialTokenUnreadableError)) {
      // A database or key-configuration failure is transient: the lease expires
      // and the account is claimed again; its status is left alone.
      throw err
    }
    // A stored value that cannot even be parsed never refreshes: the account needs a
    // reconnect, so it leaves the refresh scan. The write is fenced on the
    // claim's lease (no token was read); a reconnect meanwhile wins.
    // The error is logged without the credentials it failed to decrypt.
    log.error(
      { err, accountId: account.id },
      "refreshSocialAccountTokens: credentials unreadable, the account needs a reconnect",
    )
    await socialAccountService.markNeedsReauthUnreadable({
      ...ref,
      leaseUntil: account.leaseUntil,
    })
    return
  }
  if (!credentials) {
    return
  }
  const adapter = Object.values(socialAccountProviders).find(
    (candidate) => candidate.provider === credentials.provider,
  )
  if (!adapter?.refreshToken) {
    return
  }
  const fence = {
    leaseUntil: account.leaseUntil,
    readAccessToken: credentials.accessTokenCiphertext,
  }
  // An expired access token ends a network whose refresh needs the unexpired
  // token; one that refreshes with its own refresh token (TikTok) still can.
  if (
    !adapter.refreshUsesAppCredentials &&
    credentials.tokenExpiresAt &&
    credentials.tokenExpiresAt.getTime() <= Date.now()
  ) {
    await socialAccountService.markNeedsReauth({
      ...ref,
      fence,
      reason: "tokenExpired",
    })
    return
  }
  try {
    // A network whose refresh needs the app's client key and secret (TikTok)
    // reads them from the owner's credential at this moment, never from the row.
    let settings: Awaited<ReturnType<typeof resolveAppSettings>> = null
    if (adapter.refreshUsesAppCredentials) {
      settings = await resolveAppSettings(
        account.workspaceId,
        adapter.credentialType,
      )
      if (!settings) {
        // The owner removed the app: nothing can refresh, retry later (a later
        // re-configuration revives it) rather than punishing the account.
        await socialAccountService.deferRefresh({
          ...ref,
          fence,
          retryAt: new Date(Date.now() + RETRY_DELAY_MS),
        })
        return
      }
    }
    const refreshed = await adapter.refreshToken(credentials, settings)
    // The platform may have rotated the refresh token (the old one is dead now):
    // it is stored in the same write as the new access token, under the same fence.
    const stored = await socialAccountService.applyRefreshedToken({
      ...ref,
      accessToken: refreshed.accessToken,
      fence,
      refreshToken: refreshed.refreshToken,
      tokenExpiresAt: refreshed.expiresAt,
    })
    if (!stored) {
      log.info(
        { accountId: account.id },
        "refreshSocialAccountTokens: claim lost, the refreshed token was not stored (a rotated refresh token is lost with it)",
      )
    }
  } catch (err) {
    if (adapter.requiresReconnect(err)) {
      await socialAccountService.markNeedsReauth({
        ...ref,
        fence,
        reason: "refreshRejected",
      })
      log.warn(
        { accountId: account.id, provider: credentials.provider },
        "refreshSocialAccountTokens: token rejected, account needs a reconnect",
      )
      return
    }
    await socialAccountService.deferRefresh({
      ...ref,
      fence,
      retryAt: new Date(Date.now() + RETRY_DELAY_MS),
    })
    log.warn(
      { err, accountId: account.id, provider: credentials.provider },
      "refreshSocialAccountTokens: transient failure, retrying later",
    )
  }
}

/**
 * Runs every minute (`register-schedules.ts`). Claims the connected accounts
 * whose token expires within two weeks (a conditional UPDATE with a lease, so two
 * workers never take the same row) and refreshes each, for the networks whose
 * adapter can refresh a token. A blocked workspace owner is skipped without
 * touching the account (its lease ends and the row is picked up again later).
 */
export async function refreshSocialAccountTokens(): Promise<void> {
  try {
    await distributedLock.runExclusive({
      key: LOCK_KEY,
      timeoutInSeconds: LOCK_TIMEOUT_SECONDS,
      retryTimeoutInSeconds: LOCK_ACQUIRE_RETRY_SECONDS,
      fn: async () => {
        const claimed = await socialAccountService.claimDueForRefresh({
          providers: refreshableProviders(),
        })
        for (const account of claimed) {
          try {
            await withBlockedOwnerGuard(account.workspaceId, async () => {
              await refreshOne({
                id: account.id,
                leaseUntil: account.leaseUntil,
                workspaceId: account.workspaceId,
              })
            })
          } catch (err) {
            // One account's failure (a DB error on a status write, the guard)
            // must not leave the accounts claimed after it unprocessed.
            log.error(
              { err, accountId: account.id },
              "refreshSocialAccountTokens: account failed, continuing with the next",
            )
          }
        }
        if (claimed.length > 0) {
          log.info(
            { claimed: claimed.length },
            "refreshSocialAccountTokens: processed accounts",
          )
        }
      },
    })
  } catch (err) {
    if (
      isLockAcquisitionError(err, LOCK_KEY) &&
      (await distributedStore.exists(LOCK_KEY))
    ) {
      log.warn(
        { err },
        "refreshSocialAccountTokens: skipped because another run still holds the lock",
      )
      return
    }
    throw err
  }
}
