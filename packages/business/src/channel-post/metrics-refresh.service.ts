import { channelPostSyncRepository } from "@chatbotx.io/database/repositories"
import { casStore } from "@chatbotx.io/redis"
import {
  isPostManagementChannel,
  POST_CHANNEL_CAPABILITIES,
} from "@chatbotx.io/utils/channel"
import {
  CHANNEL_POST_METRICS_BATCH_MAX,
  CHANNEL_POST_METRICS_STALE_MS,
} from "@chatbotx.io/utils/channel-post"
import { LowJobAction, lowQueue } from "@chatbotx.io/worker-config"
import { BaseService } from "../base.service"
import { logger } from "../logger"

/** How long BullMQ keeps a finished metrics job: short, the per-post claim is what bounds repeats. */
const METRICS_JOB_KEEP_SECONDS = 60

export type ChannelPostMetricsRefreshResult = {
  /** Posts handed to a background read (one job per inbox). */
  queued: number
  /** Posts whose counts were read less than {@link CHANNEL_POST_METRICS_STALE_MS} ago. */
  fresh: number
  /** Posts that cannot be read now: unknown or removed, inbox not connected, or a channel with no batch read. */
  skipped: number
}

/** The per-post claim of one read window: a post is read at most once per window, however requests overlap. */
const claimKey = (workspaceId: string, channelPostId: string): string =>
  `channel-post-metrics-claim:${workspaceId}:${channelPostId}`

type Candidate = Awaited<
  ReturnType<typeof channelPostSyncRepository.findMetricsRefreshCandidates>
>[number]

/** The channel's capability says its handler reads several posts' counts at once. */
const canReadMetricsInBatch = (channel: string): boolean =>
  isPostManagementChannel(channel) &&
  POST_CHANNEL_CAPABILITIES[channel].metricsBatchRead

const isStale = (candidate: Candidate, nowMs: number): boolean =>
  candidate.metricsFetchedAt === null ||
  nowMs - candidate.metricsFetchedAt.getTime() >= CHANNEL_POST_METRICS_STALE_MS

const groupByInbox = (candidates: Candidate[]): Map<string, string[]> => {
  const byInbox = new Map<string, string[]>()
  for (const candidate of candidates) {
    byInbox.set(candidate.inboxId, [
      ...(byInbox.get(candidate.inboxId) ?? []),
      candidate.id,
    ])
  }
  return byInbox
}

class ChannelPostMetricsRefreshService extends BaseService {
  /**
   * Asks for fresh counts of up to 50 posts of the workspace, in the
   * background: one low-queue job per inbox reads them in one channel call.
   * Only the workspace's own, unremoved posts whose inbox is connected (with
   * its integration) are considered, and only those not read in the last 5
   * minutes. A posts page may call it for the rows it shows; it is best
   * effort, so a failed enqueue is logged and not counted as queued.
   *
   * Like every POST mutation it is refused on a trial-expired workspace, and
   * the Posts page does not call it for a read-only workspace.
   */
  async requestMetricsRefresh(input: {
    channelPostIds: string[]
    workspaceId: string
  }): Promise<ChannelPostMetricsRefreshResult> {
    const ids = [...new Set(input.channelPostIds)].slice(
      0,
      CHANNEL_POST_METRICS_BATCH_MAX,
    )
    const nowMs = Date.now()
    const candidates =
      await channelPostSyncRepository.findMetricsRefreshCandidates({
        ids,
        workspaceId: input.workspaceId,
      })
    const readable = candidates.filter(
      (candidate) =>
        candidate.eligible && canReadMetricsInBatch(candidate.channel),
    )
    const stale = readable.filter((candidate) => isStale(candidate, nowMs))
    // Claim each stale post BEFORE queueing: only the request that wins the
    // claim reads it, so overlapping requests ([A,B], [A,C], [A,B,C]) never
    // read a post twice in a window. A post another request claimed is fresh.
    const claimed = await this.claim(stale, input.workspaceId)
    let queued = 0
    for (const [inboxId, channelPostIds] of groupByInbox(claimed)) {
      const added = await this.enqueue({
        channelPostIds,
        inboxId,
        nowMs,
        workspaceId: input.workspaceId,
      })
      queued += added ? channelPostIds.length : 0
    }
    return {
      fresh: readable.length - queued,
      queued,
      skipped: ids.length - readable.length,
    }
  }

  /**
   * What the job needs: the workspace's posts of this inbox among
   * `channelPostIds` that can still be read (unremoved, inbox connected).
   */
  async findRefreshTargets(input: {
    channelPostIds: string[]
    inboxId: string
    workspaceId: string
  }): Promise<{ channel: string; externalPostId: string; id: string }[]> {
    const candidates =
      await channelPostSyncRepository.findMetricsRefreshCandidates({
        ids: input.channelPostIds.slice(0, CHANNEL_POST_METRICS_BATCH_MAX),
        workspaceId: input.workspaceId,
      })
    return candidates
      .filter(
        (candidate) =>
          candidate.eligible && candidate.inboxId === input.inboxId,
      )
      .map(({ channel, externalPostId, id }) => ({
        channel,
        externalPostId,
        id,
      }))
  }

  /**
   * Takes the post's claim for one 5-minute window (SET NX with a TTL). A post
   * whose claim cannot be taken (held by another request, or Redis failed) is
   * left out: with no way to tell, reading it twice is worse than waiting.
   */
  private async claim(
    candidates: Candidate[],
    workspaceId: string,
  ): Promise<Candidate[]> {
    const claimed: Candidate[] = []
    for (const candidate of candidates) {
      try {
        const won = await casStore.setIfAbsent(
          claimKey(workspaceId, candidate.id),
          1,
          CHANNEL_POST_METRICS_STALE_MS,
        )
        if (won) {
          claimed.push(candidate)
        }
      } catch (err) {
        logger.warn(
          { err, channelPostId: candidate.id },
          "channel-post: claiming a metrics read failed",
        )
      }
    }
    return claimed
  }

  /** Gives the claims back after the job could not be queued, so a later request can try again. */
  private async release(
    channelPostIds: string[],
    workspaceId: string,
  ): Promise<void> {
    await Promise.all(
      channelPostIds.map(async (id) => {
        try {
          await casStore.del(claimKey(workspaceId, id))
        } catch (err) {
          logger.warn(
            { err, channelPostId: id },
            "channel-post: releasing a metrics claim failed",
          )
        }
      }),
    )
  }

  private async enqueue(input: {
    channelPostIds: string[]
    inboxId: string
    nowMs: number
    workspaceId: string
  }): Promise<boolean> {
    try {
      await lowQueue.add(
        LowJobAction.refreshChannelPostMetrics,
        {
          type: LowJobAction.refreshChannelPostMetrics,
          data: {
            channelPostIds: input.channelPostIds,
            inboxId: input.inboxId,
            workspaceId: input.workspaceId,
          },
        },
        {
          attempts: 1,
          removeOnComplete: { age: METRICS_JOB_KEEP_SECONDS },
          removeOnFail: { age: METRICS_JOB_KEEP_SECONDS },
        },
      )
      return true
    } catch (err) {
      logger.warn(
        { err, inboxId: input.inboxId },
        "channel-post: queueing a metrics refresh failed",
      )
      await this.release(input.channelPostIds, input.workspaceId)
      return false
    }
  }
}

export const channelPostMetricsRefreshService =
  new ChannelPostMetricsRefreshService()
