import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  CHANNEL_POST_SYNC_NOT_CONNECTED,
  type ChannelPostSyncStatus,
  type ChannelType,
  channelPostSyncStatuses,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  channelPostManagementRepository,
  channelPostMetricRepository,
  channelPostRepository,
  channelPostSyncRepository,
  upsertListedChannelPosts,
} from "@chatbotx.io/database/repositories"
import type { ChannelPostListItem } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  isPostManagementChannel,
  postManagementChannels,
} from "@chatbotx.io/utils/channel"
import { CHANNEL_POST_LIVE_STALE_AFTER_MS } from "@chatbotx.io/utils/channel-post"
import { LowJobAction, lowQueue } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { notFoundException, validationException } from "../errors"
import { logger } from "../logger"
import { channelPostCommentsService } from "./comments.service"
import { channelPostService } from "./service"
import { resetChannelPostSyncAfterAuthChange } from "./sync-reset"

/** How long after a finished listing the next one is due (PROPOSED). */
export const CHANNEL_POST_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
/** Pause between two manual refreshes of one inbox (PROPOSED). */
export const CHANNEL_POST_REFRESH_COOLDOWN_MS = 60 * 1000
/** The same pause for one post's refresh, in the seconds BullMQ keeps a job. */
const CHANNEL_POST_REFRESH_COOLDOWN_SECONDS =
  CHANNEL_POST_REFRESH_COOLDOWN_MS / 1000
/** A queued row whose job never ran is looked at again after this long. */
export const CHANNEL_POST_SYNC_QUEUED_RECHECK_MS = 10 * 60 * 1000
/** A running sync that has not heartbeated for this long is taken over. */
export const CHANNEL_POST_SYNC_STALLED_AFTER_MS = 10 * 60 * 1000
/** Posts one listing walks at most (PROPOSED). */
export const CHANNEL_POST_SYNC_MAX_POSTS_PER_CYCLE = 2000
/** Posts asked of the channel per page. */
export const CHANNEL_POST_SYNC_PAGE_SIZE = 100
/** Pages one job reads before handing the rest to the next tick. */
export const CHANNEL_POST_SYNC_MAX_PAGES_PER_JOB = 5
/** Time one job spends before handing the rest to the next tick. */
export const CHANNEL_POST_SYNC_JOB_BUDGET_MS = 60 * 1000
/** Failures after which a sync stops retrying on its own. */
export const CHANNEL_POST_SYNC_MAX_ATTEMPTS = 5
/** Wait before retrying a rate-limited sync. */
export const CHANNEL_POST_SYNC_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000
/** Waits before the 1st, 2nd, ... retry of a transient failure (PROPOSED). */
export const CHANNEL_POST_SYNC_RETRY_BACKOFF_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
]
/** A broadcast older than this that no re-read settled is left as it is. */
export const CHANNEL_POST_LIVE_GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000
/** Stale live rows one scanner tick sends to a re-read. */
export const CHANNEL_POST_LIVE_RECHECK_BATCH = 20
/** Rows the scanner queues per tick. */
const SCAN_BATCH_SIZE = 50

/** The wait before retry number `attempts` (1-based); the last step repeats. */
export const channelPostSyncRetryDelayMs = (attempts: number): number =>
  CHANNEL_POST_SYNC_RETRY_BACKOFF_MS[
    Math.min(Math.max(attempts, 1), CHANNEL_POST_SYNC_RETRY_BACKOFF_MS.length) -
      1
  ] ?? CHANNEL_POST_SYNC_RATE_LIMIT_BACKOFF_MS

/**
 * Unique per queueing: the previous slice's job can still be active when the
 * scanner queues the next one, and BullMQ drops an add whose id is taken. The
 * `claim` guard (a row must be `queued`) keeps two workers off one inbox, so
 * the id does not need to dedupe.
 */
export const channelPostSyncJobId = (
  inboxId: string,
  queuedAtMs: number,
): string => `sync-channel-posts-${inboxId}-${queuedAtMs}`

export type ChannelPostSyncRequestResult = {
  channel: ChannelType
  inboxId: string
  inboxName: string
  /** `true` when this call started a sync. */
  requested: boolean
  status: ChannelPostSyncStatus
}

export type ChannelPostSyncStatusItem = {
  attempts: number
  backfillCompletedAt: Date | null
  channel: ChannelType
  inboxId: string
  inboxName: string
  lastError: string | null
  lastErrorCategory: string | null
  lastRequestedAt: Date | null
  lastSyncedAt: Date | null
  nextSyncAt: Date | null
  status: ChannelPostSyncStatus
  syncedCount: number
}

type SyncRow = Awaited<
  ReturnType<typeof channelPostSyncRepository.listForWorkspace>
>[number]

/**
 * Narrows a stored row to the typed item. `channel` and `status` are plain
 * strings in the database; a value outside the known sets (a retired channel)
 * is skipped rather than failing the whole list.
 */
const toStatusItems = (rows: SyncRow[]): ChannelPostSyncStatusItem[] =>
  rows.flatMap((row) => {
    const channel = channelTypes.safeParse(row.channel)
    const status = channelPostSyncStatuses.safeParse(row.status)
    if (!(channel.success && status.success)) {
      return []
    }
    return [{ ...row, channel: channel.data, status: status.data }]
  })

export type ClaimedChannelPostSync = {
  attempts: number
  backfillCompletedAt: Date | null
  channel: string
  claimToken: string
  id: string
  inboxId: string
  resumeCursor: string | null
  syncedCount: number
  workspaceId: string
}

/**
 * Most comments one repair of a post's phone-comment count looks at. A post
 * with more phone comments than this is left as it is: the count is only a
 * lower bound there, and writing it would shrink a correct number.
 */
export const CHANNEL_POST_PHONE_RECOUNT_LIMIT = 10_000

/** What a committed page does to the claimed sync's position. */
export const channelPostPageOutcomes = [
  "progress",
  "continueLater",
  "complete",
  // The post cap was hit before the listing's end: this cycle is over, but the
  // backlog was not read to the end, so the backfill is not complete.
  "capped",
] as const
export type ChannelPostPageOutcome = (typeof channelPostPageOutcomes)[number]

export type RecordPageInput = {
  channel: string
  inboxId: string
  integrationId: string
  items: ChannelPostListItem[]
  /**
   * When the channel was read (taken before the request, so a slow write is
   * not mistaken for a newer observation); defaults to the write time.
   */
  observedAt?: Date
  sourceAccountId: string
  thumbnailDeadline: number
  /** The workspace's IANA zone, naming the day of a metric snapshot (UTC when absent). */
  timezone?: string
  workspaceId: string
}

/** Thrown inside the page transaction so the page is rolled back; never leaves the service. */
class ChannelPostSyncClaimLostError extends Error {}

const toUpsert = (input: RecordPageInput) => ({
  now: new Date(),
  observedAt: input.observedAt,
  timezone: input.timezone,
  posts: input.items
    .filter((item) => item.externalPostId !== "")
    .map((item) => ({
      authorExternalId: item.authorExternalId,
      authorName: item.authorName,
      caption: item.caption,
      commentsCount: item.commentsCount,
      contentType: item.contentType,
      externalPostId: item.externalPostId,
      liveStatus: item.liveStatus,
      mediaType: item.mediaType,
      permalink: item.permalink,
      publishedAt: item.publishedAt,
      reactionsCount: item.reactionsCount,
      sharesCount: item.sharesCount,
      viewsCount: item.viewsCount,
    })),
  target: {
    channel: input.channel,
    inboxId: input.inboxId,
    integrationId: input.integrationId,
    sourceAccountId: input.sourceAccountId,
    workspaceId: input.workspaceId,
  },
})

class ChannelPostSyncService extends BaseService {
  /**
   * Starts a sync for the workspace's inboxes (all eligible ones when
   * `inboxIds` is omitted). An inbox that is already queued or running, or was
   * refreshed within the cooldown, is left alone and reported as such.
   */
  async request(input: {
    inboxIds?: string[]
    workspaceId: string
  }): Promise<{ items: ChannelPostSyncRequestResult[] }> {
    const channels = postManagementChannels.options
    const eligible = await channelPostSyncRepository.findEligibleInboxes({
      channels,
      inboxIds: input.inboxIds,
      workspaceId: input.workspaceId,
    })
    this.assertRequestedInboxesAreEligible(input.inboxIds, eligible)
    // An inbox that cannot sync (disconnected, or connected without its
    // integration row) gets no sync row and no job, and is left out of the answer.
    const inboxes = eligible.filter((inbox) => inbox.syncable)

    const now = new Date()
    await channelPostSyncRepository.ensureRows({
      inboxes,
      now,
      workspaceId: input.workspaceId,
    })

    const started = new Set<string>()
    for (const inbox of inboxes) {
      const row = await channelPostSyncRepository.requestRefresh({
        cooldownMs: CHANNEL_POST_REFRESH_COOLDOWN_MS,
        inboxId: inbox.id,
        now,
        queuedUntil: new Date(
          now.getTime() + CHANNEL_POST_SYNC_QUEUED_RECHECK_MS,
        ),
        workspaceId: input.workspaceId,
      })
      if (row) {
        started.add(inbox.id)
        await this.enqueue({
          inboxId: inbox.id,
          workspaceId: input.workspaceId,
        })
      }
    }

    const rows = await channelPostSyncRepository.listForWorkspace({
      inboxIds: inboxes.map((inbox) => inbox.id),
      workspaceId: input.workspaceId,
    })
    return {
      items: toStatusItems(rows).map((row) => ({
        channel: row.channel,
        inboxId: row.inboxId,
        inboxName: row.inboxName,
        requested: started.has(row.inboxId),
        status: row.status,
      })),
    }
  }

  /**
   * Re-reads one post from its channel, in the background: the job refreshes
   * its counts, or hides it when the channel confirms it is gone. One post is
   * re-read at most once a minute; a repeat inside that minute is a no-op.
   */
  async requestPostRefresh(input: {
    id: string
    workspaceId: string
  }): Promise<{ queued: true }> {
    const target =
      await channelPostManagementRepository.findRefreshTarget(input)
    if (!(target && isPostManagementChannel(target.channel))) {
      throw notFoundException("Post not found.")
    }
    await lowQueue.add(
      LowJobAction.refreshChannelPost,
      {
        type: LowJobAction.refreshChannelPost,
        data: { channelPostId: input.id, workspaceId: input.workspaceId },
      },
      {
        attempts: 1,
        // A finished job is kept for the cooldown, so a repeat of the same id
        // inside it is ignored by the queue (BullMQ drops a duplicate job id).
        jobId: `refresh-channel-post-${input.id}`,
        removeOnComplete: { age: CHANNEL_POST_REFRESH_COOLDOWN_SECONDS },
        removeOnFail: { age: CHANNEL_POST_REFRESH_COOLDOWN_SECONDS },
      },
    )
    return { queued: true }
  }

  /** The workspace's time zone for metric snapshots; UTC when it cannot be read. */
  async workspaceTimezone(workspaceId: string): Promise<string> {
    return (
      (await channelPostMetricRepository.findWorkspaceTimezone(workspaceId)) ??
      "UTC"
    )
  }

  /** What the refresh job needs to reach the post's channel. */
  async findPostRefreshTarget(input: { id: string; workspaceId: string }) {
    return await channelPostManagementRepository.findRefreshTarget(input)
  }

  /** The channel confirmed the post is gone: hide it. */
  async markPostRemoved(input: {
    id: string
    workspaceId: string
  }): Promise<void> {
    await channelPostManagementRepository.markRemoved({
      ...input,
      now: new Date(),
    })
  }

  async listStatus(input: {
    inboxIds?: string[]
    workspaceId: string
  }): Promise<{ items: ChannelPostSyncStatusItem[] }> {
    return {
      items: toStatusItems(
        await channelPostSyncRepository.listForWorkspace(input),
      ),
    }
  }

  /**
   * One scanner tick: queues the syncs that are due and enqueues their jobs.
   * Returns how many were queued.
   */
  async scanDue(): Promise<number> {
    const now = new Date()
    await this.selfHeal(now)
    const queued = await channelPostSyncRepository.queueDue({
      batchSize: SCAN_BATCH_SIZE,
      now,
      queuedUntil: new Date(
        now.getTime() + CHANNEL_POST_SYNC_QUEUED_RECHECK_MS,
      ),
      stalledBefore: new Date(
        now.getTime() - CHANNEL_POST_SYNC_STALLED_AFTER_MS,
      ),
    })
    for (const row of queued) {
      await this.enqueue({ inboxId: row.inboxId, workspaceId: row.workspaceId })
    }
    await this.requestStaleLiveRefreshes(now)
    return queued.length
  }

  /**
   * Claims a bounded batch of live broadcasts that are due (`liveRecheckAt`)
   * and sends each to the channel-post refresh job, so a missed end event still
   * ends them. The claim moves every row's due time forward before any
   * integration is looked at, so a row whose re-read cannot run (its
   * integration is gone) goes to the back of the line and never starves the
   * rest. A failure here never stops the scan.
   */
  private async requestStaleLiveRefreshes(now: Date): Promise<void> {
    try {
      const claimed = await channelPostRepository.claimLiveRechecks({
        giveUpBefore: new Date(
          now.getTime() - CHANNEL_POST_LIVE_GIVE_UP_AFTER_MS,
        ),
        limit: CHANNEL_POST_LIVE_RECHECK_BATCH,
        now,
        recheckAfterMs: CHANNEL_POST_LIVE_STALE_AFTER_MS,
      })
      for (const row of claimed) {
        await this.requestPostRefresh(row).catch((err: unknown) => {
          logger.warn(
            { err, channelPostId: row.id },
            "channel-post-sync: could not queue a live re-read",
          )
        })
      }
    } catch (err) {
      logger.warn(
        { err },
        "channel-post-sync: claiming stale live posts failed",
      )
    }
  }

  /**
   * The inbox's authorisation changed (reconnect): a failed row, or one parked
   * as not connected, becomes due again with its error cleared. Pass the
   * caller's transaction so it commits with the auth write.
   */
  async resetAfterAuthChange(
    input: { inboxId: string; workspaceId: string },
    tx?: DatabaseClient,
  ): Promise<boolean> {
    return await resetChannelPostSyncAfterAuthChange(input, tx)
  }

  /**
   * Bounded repairs the scanner runs before queueing: rows whose inbox cannot
   * sync are parked as `notConnected`, and permanent auth failures whose
   * integration changed since the failure become due once more.
   */
  private async selfHeal(now: Date): Promise<void> {
    const parked = await channelPostSyncRepository.parkIneligible({
      batchSize: SCAN_BATCH_SIZE,
      now,
    })
    const released =
      await channelPostSyncRepository.releaseRecoveredAuthFailures({
        batchSize: SCAN_BATCH_SIZE,
        now,
      })
    const reconnected =
      await channelPostSyncRepository.releaseReconnectedParked({
        batchSize: SCAN_BATCH_SIZE,
        now,
      })
    if (parked > 0 || released > 0 || reconnected > 0) {
      logger.info(
        { parked, released, reconnected },
        "channel-post-sync: repaired sync rows",
      )
    }
  }

  /** Takes the queued sync of an inbox for this worker, or `null` when there is none. */
  async claim(inboxId: string): Promise<ClaimedChannelPostSync | null> {
    const claimToken = createId()
    const row = await channelPostSyncRepository.claim({
      claimToken,
      inboxId,
      now: new Date(),
    })
    return row ? { ...row, claimToken } : null
  }

  /**
   * Writes one page of the listing: new posts are inserted, changed ones
   * updated, and the thumbnails of posts that have none are re-hosted until
   * `thumbnailDeadline` (a post left without one is picked up by a later sync).
   * For a read nobody claimed (refreshing one post); a claimed sync commits its
   * pages with {@link commitPage}.
   */
  async recordPage(input: RecordPageInput): Promise<void> {
    await upsertListedChannelPosts(toUpsert(input))
    await this.rehostThumbnails(input)
  }

  /**
   * Writes one page of the listing and the claimed sync's position in ONE
   * transaction. The position write is fenced by the claim token, so a worker
   * that was taken over finds it touches no row, the page is rolled back, and
   * `false` comes back: a stale worker never overwrites newer metrics. Thumbnails
   * (network downloads) are re-hosted after the commit.
   */
  async commitPage(input: {
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">
    outcome: ChannelPostPageOutcome
    /** The next page's cursor; `null` for a finished listing. */
    resumeCursor: string | null
    page: RecordPageInput
    syncedCount: number
  }): Promise<boolean> {
    try {
      await db.transaction(async (tx) => {
        await upsertListedChannelPosts(toUpsert(input.page), tx)
        const kept = await this.writePosition(input, tx)
        if (!kept) {
          throw new ChannelPostSyncClaimLostError()
        }
      })
    } catch (err) {
      if (err instanceof ChannelPostSyncClaimLostError) {
        return false
      }
      throw err
    }
    await this.rehostThumbnails(input.page)
    return true
  }

  private async writePosition(
    input: {
      claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">
      outcome: ChannelPostPageOutcome
      resumeCursor: string | null
      syncedCount: number
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const { claim, outcome, resumeCursor, syncedCount } = input
    if (outcome === "complete" || outcome === "capped") {
      return await this.completeCycle(claim, syncedCount, tx, {
        reachedEnd: outcome === "complete",
      })
    }
    const progress = { resumeCursor: resumeCursor ?? "", syncedCount }
    return outcome === "continueLater"
      ? await this.continueLater(claim, progress, tx)
      : await this.saveProgress(claim, progress, tx)
  }

  private async rehostThumbnails(input: RecordPageInput): Promise<void> {
    await channelPostService.rehostListedThumbnails({
      channel: input.channel,
      deadline: input.thumbnailDeadline,
      posts: input.items
        .filter((item) => item.externalPostId !== "")
        .map((item) => ({
          externalPostId: item.externalPostId,
          thumbnailUrl: item.thumbnailUrl,
        })),
      workspaceId: input.workspaceId,
    })
  }

  /**
   * Repairs a post's stored phone-comment count from its comments. The counter
   * is kept by increments in another database and can fall short (a failed
   * increment is never undone, so it can never run over); this sets it to what
   * the comments say. A bounded read, run when a person refreshes the post, not
   * on the periodic sync. An increment landing between the read and the write
   * can be overwritten and is then repaired by the next refresh.
   */
  async reconcilePhoneCount(input: {
    id: string
    workspaceId: string
  }): Promise<{ count: number; repaired: boolean; skipped: boolean }> {
    // A phone comment arriving during this repair can leave a small transient
    // drift; the next refresh corrects it.
    const { capped, count } =
      await channelPostCommentsService.countPhoneComments({
        limit: CHANNEL_POST_PHONE_RECOUNT_LIMIT,
        postId: input.id,
        workspaceId: input.workspaceId,
      })
    if (capped) {
      return { count, repaired: false, skipped: true }
    }
    const repaired = await channelPostRepository.setPhoneCommentsCount({
      count,
      id: input.id,
      workspaceId: input.workspaceId,
    })
    return { count, repaired, skipped: false }
  }

  /** Heartbeat and listing position; `false` means the sync was taken over. */
  async saveProgress(
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">,
    progress: { resumeCursor: string | null; syncedCount: number },
    tx?: DatabaseClient,
  ): Promise<boolean> {
    return await channelPostSyncRepository.saveProgress(
      {
        claimToken: claim.claimToken,
        id: claim.id,
        now: new Date(),
        ...progress,
      },
      tx,
    )
  }

  /** The listing is not finished: wait for the next tick and resume from the cursor. */
  async continueLater(
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">,
    progress: { resumeCursor: string; syncedCount: number },
    tx?: DatabaseClient,
  ): Promise<boolean> {
    const now = new Date()
    return await channelPostSyncRepository.release(
      {
        claimToken: claim.claimToken,
        id: claim.id,
        markBackfillComplete: false,
        markSynced: false,
        now,
        outcome: {
          attempts: 0,
          lastError: null,
          lastErrorCategory: null,
          nextSyncAt: now,
          resumeCursor: progress.resumeCursor,
          syncedCount: progress.syncedCount,
        },
      },
      tx,
    )
  }

  /** The listing reached its end (or its cap, `reachedEnd: false`): the next one is due in a while. */
  async completeCycle(
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">,
    syncedCount: number,
    tx?: DatabaseClient,
    options: { reachedEnd: boolean } = { reachedEnd: true },
  ): Promise<boolean> {
    const now = new Date()
    return await channelPostSyncRepository.release(
      {
        claimToken: claim.claimToken,
        id: claim.id,
        // Only a listing that reached its end proves every post was read; a
        // cycle stopped by the post cap must not claim it.
        markBackfillComplete: options.reachedEnd,
        markSynced: true,
        now,
        outcome: {
          attempts: 0,
          lastError: null,
          lastErrorCategory: null,
          nextSyncAt: new Date(now.getTime() + CHANNEL_POST_SYNC_INTERVAL_MS),
          resumeCursor: null,
          syncedCount,
        },
      },
      tx,
    )
  }

  /**
   * A transient failure: wait and keep the position. It counts as an attempt
   * unless `countAttempt` is false (a rate limit is the platform asking us to
   * slow down, not a failure of the sync).
   */
  async retryLater(
    claim: Pick<ClaimedChannelPostSync, "attempts" | "claimToken" | "id">,
    failure: {
      category: string | null
      countAttempt: boolean
      delayMs: number
      message: string
      resumeCursor: string | null
      syncedCount: number
    },
  ): Promise<boolean> {
    const now = new Date()
    return await channelPostSyncRepository.release({
      claimToken: claim.claimToken,
      id: claim.id,
      markBackfillComplete: false,
      markSynced: false,
      now,
      outcome: {
        attempts: failure.countAttempt ? claim.attempts + 1 : claim.attempts,
        lastError: failure.message,
        lastErrorCategory: failure.category,
        nextSyncAt: new Date(now.getTime() + failure.delayMs),
        resumeCursor: failure.resumeCursor,
        syncedCount: failure.syncedCount,
      },
    })
  }

  /**
   * The inbox has no integration to read with. Not a failure of the sync: the
   * row goes back to `idle` with no next time, so nothing retries it until a
   * new sync request (after the channel is connected again).
   */
  async markNotConnected(
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">,
  ): Promise<boolean> {
    return await channelPostSyncRepository.release({
      claimToken: claim.claimToken,
      id: claim.id,
      markBackfillComplete: false,
      markSynced: false,
      now: new Date(),
      outcome: {
        attempts: 0,
        lastError: null,
        lastErrorCategory: CHANNEL_POST_SYNC_NOT_CONNECTED,
        nextSyncAt: null,
        resumeCursor: null,
        syncedCount: 0,
      },
    })
  }

  /** A failure no retry can fix: stop until a person acts. */
  async fail(
    claim: Pick<ClaimedChannelPostSync, "claimToken" | "id">,
    failure: { category: string | null; message: string },
  ): Promise<boolean> {
    return await channelPostSyncRepository.markFailed({
      claimToken: claim.claimToken,
      id: claim.id,
      lastError: failure.message,
      lastErrorCategory: failure.category,
      now: new Date(),
    })
  }

  private assertRequestedInboxesAreEligible(
    requested: string[] | undefined,
    eligible: { id: string }[],
  ): void {
    if (!requested?.length) {
      return
    }
    const known = new Set(eligible.map((inbox) => inbox.id))
    if (requested.some((inboxId) => !known.has(inboxId))) {
      throw requested.length === 1
        ? notFoundException("Inbox not found or its channel has no post list.")
        : validationException(
            "inboxIds",
            "Every inbox must exist in the workspace and be on a channel with a post list.",
          )
    }
  }

  /**
   * Enqueues the sync job. A failure is logged, not thrown: the row stays
   * queued and the scanner looks at it again once `queuedUntil` passes.
   */
  private async enqueue(input: {
    inboxId: string
    workspaceId: string
  }): Promise<void> {
    try {
      await lowQueue.add(
        LowJobAction.syncChannelPosts,
        {
          type: LowJobAction.syncChannelPosts,
          data: { inboxId: input.inboxId, workspaceId: input.workspaceId },
        },
        {
          jobId: channelPostSyncJobId(input.inboxId, Date.now()),
          removeOnComplete: true,
          removeOnFail: true,
        },
      )
    } catch (err) {
      logger.warn(
        { err, inboxId: input.inboxId },
        "channel-post-sync: failed to enqueue the sync job",
      )
    }
  }
}

export const channelPostSyncService = new ChannelPostSyncService()
