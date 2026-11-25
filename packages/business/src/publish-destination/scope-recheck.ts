import {
  publishCredentialRepository,
  publishDestinationRepository,
  publishDestinationStateRepository,
} from "@chatbotx.io/database/repositories"
import { toLogSafeError } from "@chatbotx.io/logger"
import { casStore } from "@chatbotx.io/redis"
import { createId } from "@chatbotx.io/utils"
import { sha256Hex } from "@chatbotx.io/utils/crypto"
import {
  missingPublishScopes,
  PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS,
  PUBLISH_SCOPE_RECHECK_MAX,
  PUBLISH_SCOPE_RECHECK_SOURCE,
  type ScopeReadResult,
} from "@chatbotx.io/utils/publish-destination"
import type { PublisherKey } from "@chatbotx.io/utils/social-publisher"
import { LowJobAction, lowQueue } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { logger } from "../logger"

/** The network call, injected so this package stays free of channel code. */
export type ScopeRecheckOps = {
  /** The permissions the platform reports for the stored token; never throws. */
  readScopes: (input: {
    accessToken: string
    /** The integration's raw `auth` (app credentials for `debug_token`); never log it. */
    auth: unknown
    publisherKey: PublisherKey
  }) => Promise<ScopeReadResult>
}

export type ScopeRecheckRequestResult = {
  /** Destinations whose re-read was queued. */
  queued: number
  /** Destinations checked less than 10 minutes ago, or already claimed by another request. */
  fresh: number
  /** Destinations whose re-read could not be queued (queue or claim store unavailable); their claims were given back, ask again later. */
  failed: number
  /** Destinations that cannot be re-checked now: unknown, disconnected, needing a reconnect, on a network with no documented source, or beyond the 100 of one request. */
  skipped: number
}

export const scopeRecheckOutcomes = z.enum([
  "written",
  "unchanged",
  "skipped",
  "invalidToken",
  "unreported",
  "failed",
  "rateLimited",
])
export type ScopeRecheckOutcome = z.infer<typeof scopeRecheckOutcomes>

export type ScopeRecheckRunResult = {
  outcomes: ScopeRecheckOutcome[]
  /** The run stopped early because the platform rate limited. */
  rateLimited: boolean
  /** At least one destination's stored permissions were written. */
  written: boolean
}

const JOB_KEEP_SECONDS = 60
const CONNECTED = "connected"

const claimKey = (workspaceId: string, destinationId: string): string =>
  `publish-scope-recheck-claim:${workspaceId}:${destinationId}`

const inboxTokenSchema = z.object({
  tokens: z.object({ accessToken: z.string().min(1) }),
})

type Candidate = Awaited<
  ReturnType<typeof publishDestinationStateRepository.list>
>[number]

const isRecheckable = (row: Candidate): boolean =>
  row.inboxId !== null &&
  PUBLISH_SCOPE_RECHECK_SOURCE[row.publisherKey] !== null &&
  row.state !== "inboxDisconnected" &&
  row.state !== "needsReconnect"

const isRecentlyChecked = (row: Candidate, nowMs: number): boolean =>
  row.checkedAt !== null &&
  nowMs - row.checkedAt.getTime() < PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS

/**
 * A read that gave no scopes. An invalid token is only logged: the existing
 * token-health paths own the reconnect state, never this one.
 */
const settleUnread = (
  kind: Exclude<ScopeReadResult["kind"], "scopes">,
  destinationId: string,
  workspaceId: string,
): ScopeRecheckOutcome => {
  if (kind === "invalidToken") {
    logger.warn(
      { destinationId, workspaceId },
      "publish scope re-check: the platform reports the stored token invalid; left as is",
    )
  }
  return kind
}

class PublishScopeRecheckService {
  /**
   * Asks, in the background, for the granted permissions of up to 100
   * inbox-bound destinations (Facebook Pages and Instagram through Facebook
   * Login) to be re-read from the platform. Without `destinationIds`, the
   * workspace's own such destinations. Each destination is claimed in Redis for
   * 10 minutes before queueing, so overlapping requests never read one twice;
   * ONE low-queue job per request reads the claimed ones. Best effort: a failed
   * enqueue releases the claims and counts nothing as queued.
   */
  async requestScopeRecheck(input: {
    destinationIds?: readonly string[]
    workspaceId: string
  }): Promise<ScopeRecheckRequestResult> {
    const { workspaceId } = input
    const ids = input.destinationIds
      ? [...new Set(input.destinationIds)].slice(0, PUBLISH_SCOPE_RECHECK_MAX)
      : undefined
    if (ids && ids.length === 0) {
      return { failed: 0, fresh: 0, queued: 0, skipped: 0 }
    }
    const rows = await publishDestinationStateRepository.list({
      connectedOnly: true,
      ids,
      providers: ["facebook", "instagram"],
      workspaceId,
    })
    const recheckable = rows.filter(isRecheckable)
    const nowMs = Date.now()
    const recent = recheckable.filter((row) => isRecentlyChecked(row, nowMs))
    const notRecent = recheckable.filter(
      (row) => !isRecentlyChecked(row, nowMs),
    )
    const due = notRecent.slice(0, PUBLISH_SCOPE_RECHECK_MAX)
    const overflow = notRecent.length - due.length
    const claims = await this.claim(due, workspaceId)
    const enqueued = await this.enqueue(claims.claimed, workspaceId)
    const considered = ids ? ids.length : rows.length
    return {
      failed: claims.failed + (enqueued ? 0 : claims.claimed.length),
      fresh: recent.length + claims.held,
      queued: enqueued ? claims.claimed.length : 0,
      skipped: considered - recheckable.length + overflow,
    }
  }

  /**
   * The job body: re-reads each destination one after the other and stops at
   * the first rate-limit answer (the claims of the destinations not reached
   * are given back so a later open can try again). Never throws.
   */
  async runScopeRecheck(
    input: { destinationIds: readonly string[]; workspaceId: string },
    ops: ScopeRecheckOps,
  ): Promise<ScopeRecheckRunResult> {
    const { workspaceId } = input
    const outcomes: ScopeRecheckOutcome[] = []
    for (const [index, destinationId] of input.destinationIds.entries()) {
      const outcome = await this.recheckOne({ destinationId, workspaceId }, ops)
      outcomes.push(outcome)
      if (outcome === "rateLimited") {
        await this.release(input.destinationIds.slice(index + 1), workspaceId)
        return {
          outcomes,
          rateLimited: true,
          written: outcomes.includes("written"),
        }
      }
    }
    return {
      outcomes,
      rateLimited: false,
      written: outcomes.includes("written"),
    }
  }

  private async recheckOne(
    input: { destinationId: string; workspaceId: string },
    ops: ScopeRecheckOps,
  ): Promise<ScopeRecheckOutcome> {
    const { destinationId, workspaceId } = input
    try {
      // The fence is read BEFORE the token and the platform call, so any write
      // in between (a reconnect, a publish refusal) makes the final write a no-op.
      const fence = await publishDestinationRepository.findRecheckFence({
        id: destinationId,
        workspaceId,
      })
      const source = await publishCredentialRepository.findCredentialSource({
        publishDestinationId: destinationId,
        workspaceId,
      })
      if (
        !fence ||
        source?.kind !== "inbox" ||
        source.inboxStatus !== CONNECTED ||
        source.tokenRefreshError ||
        PUBLISH_SCOPE_RECHECK_SOURCE[source.publisherKey] === null
      ) {
        return "skipped"
      }
      const auth = inboxTokenSchema.safeParse(source.auth)
      if (!auth.success) {
        return "skipped"
      }
      const { accessToken } = auth.data.tokens
      const result = await ops.readScopes({
        accessToken,
        auth: source.auth,
        publisherKey: source.publisherKey,
      })
      if (result.kind !== "scopes") {
        return settleUnread(result.kind, destinationId, workspaceId)
      }
      const written = await publishDestinationRepository.recordRecheckedScopes({
        expectedCheckedAt: fence.checkedAt,
        grantedScopes: result.scopes,
        id: destinationId,
        missingScopes: missingPublishScopes(source.publisherKey, result.scopes),
        now: new Date(),
        provider: source.provider,
        tokenFingerprint: await sha256Hex(accessToken),
        workspaceId,
      })
      return written ? "written" : "unchanged"
    } catch (err) {
      logger.warn(
        { err: toLogSafeError(err), destinationId, workspaceId },
        "publish scope re-check failed",
      )
      return "failed"
    }
  }

  private async claim<T extends { id: string }>(
    rows: readonly T[],
    workspaceId: string,
  ): Promise<{ claimed: T[]; failed: number; held: number }> {
    const claimed: T[] = []
    let held = 0
    let failed = 0
    for (const row of rows) {
      try {
        const won = await casStore.setIfAbsent(
          claimKey(workspaceId, row.id),
          1,
          PUBLISH_SCOPE_RECHECK_CLAIM_TTL_MS,
        )
        if (won) {
          claimed.push(row)
        } else {
          held += 1
        }
      } catch (err) {
        failed += 1
        logger.warn(
          { err: toLogSafeError(err), destinationId: row.id },
          "publish scope re-check: claiming failed",
        )
      }
    }
    return { claimed, failed, held }
  }

  private async release(
    destinationIds: readonly string[],
    workspaceId: string,
  ): Promise<void> {
    await Promise.all(
      destinationIds.map(async (id) => {
        try {
          await casStore.del(claimKey(workspaceId, id))
        } catch (err) {
          logger.warn(
            { err: toLogSafeError(err), destinationId: id },
            "publish scope re-check: releasing a claim failed",
          )
        }
      }),
    )
  }

  private async enqueue(
    claimed: readonly { id: string }[],
    workspaceId: string,
  ): Promise<boolean> {
    if (claimed.length === 0) {
      return false
    }
    const destinationIds = claimed.map((row) => row.id)
    try {
      await lowQueue.add(
        LowJobAction.recheckPublishDestinationScopes,
        {
          data: { destinationIds, workspaceId },
          type: LowJobAction.recheckPublishDestinationScopes,
        },
        {
          attempts: 1,
          jobId: `recheck-publish-scopes-${createId()}`,
          removeOnComplete: { age: JOB_KEEP_SECONDS },
          removeOnFail: { age: JOB_KEEP_SECONDS },
        },
      )
      return true
    } catch (err) {
      logger.warn(
        { err: toLogSafeError(err), workspaceId },
        "publish scope re-check: queueing failed",
      )
      await this.release(destinationIds, workspaceId)
      return false
    }
  }
}

export const publishScopeRecheckService = new PublishScopeRecheckService()
