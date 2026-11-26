import {
  type SocialTargetForPublish,
  socialPostPaceRepository,
} from "@chatbotx.io/database/repositories"
import { concurrencySlots, withCache } from "@chatbotx.io/redis"
import {
  CONCURRENCY_DEFER_MAX_MS,
  CONCURRENCY_DEFER_MIN_MS,
  contentTypesCountedWith,
  dailyCapFor,
  LIVE_LIMIT_CACHE_SECONDS,
  PROVIDER_PUBLISH_LIMITS,
  PUBLISH_CAP_WINDOW_MS,
  withJitter,
} from "@chatbotx.io/utils/publish-limits"
import type {
  SocialPublisher,
  SocialPublishingLimit,
} from "@chatbotx.io/utils/social-publisher"
import { z } from "zod"
import { logger } from "../logger"
import { logSafe, SOCIAL_POST_LEASE_MS } from "./publish-common"

/**
 * The pace gate: runs after a target is claimed and before anything is sent.
 * It decides whether this attempt may start now. A deferral is never a
 * failure and never spends an attempt (the caller gives the claim back with
 * `releaseClaim`). See docs/posts.md, "Publishing pace and platform limits".
 */

export const paceDeferReasons = z.enum([
  "paused",
  "dailyCap",
  "providerBusy",
  "spacing",
])
export type PaceDeferReason = z.infer<typeof paceDeferReasons>

export type PaceDecision =
  | {
      kind: "go"
      /** Gives back the provider slot; call when the attempt ends. */
      releaseSlot: () => Promise<void>
    }
  | { kind: "defer"; reason: PaceDeferReason; until: Date }

type PaceTarget = Pick<
  SocialTargetForPublish,
  "contentType" | "destinationId" | "id" | "provider" | "workspaceId"
>

export type PaceInput = {
  accessToken: string
  destinationExternalId: string
  now: Date
  /** Injectable for tests; `Math.random` otherwise. */
  random?: () => number
  publisher: Pick<SocialPublisher, "getPublishingLimit">
  target: PaceTarget
}

/** Never defer to a moment that is not in the future. */
const MIN_DEFER_MS = 60 * 1000
/** With no oldest publish to wait for, look at the cap again after this. */
const CAP_RECHECK_MS = 60 * 60 * 1000

const slotKey = (provider: string): string => `post-publish:slots:${provider}`
const liveLimitKey = (destinationId: string): string =>
  `post-publish:live-limit:${destinationId}`

/** The live quota (cached about 5 minutes per destination); `null` when the network has none or the call failed. */
const readLiveLimit = async (
  input: PaceInput,
): Promise<SocialPublishingLimit | null> => {
  const { publisher, target } = input
  const read = publisher.getPublishingLimit
  if (!read) {
    return null
  }
  try {
    return await withCache<SocialPublishingLimit | null>(
      liveLimitKey(target.destinationId),
      () =>
        read({
          accessToken: input.accessToken,
          destinationExternalId: input.destinationExternalId,
        }),
      { ttl: LIVE_LIMIT_CACHE_SECONDS },
    )
  } catch (err) {
    logger.warn(
      { err: logSafe(err), targetId: target.id },
      "social-post pace: reading the live publishing limit failed",
    )
    return null
  }
}

/**
 * The daily cap over the rolling 24 hours. Instagram and Threads read the live
 * quota and fall back to the documented number; every network also counts our
 * own published targets. When over, it waits for the oldest counted publish to
 * leave the window.
 */
export const dailyCapDeferral = async (
  input: PaceInput,
): Promise<Date | null> => {
  const { now, target } = input
  const cap = dailyCapFor(target.provider, target.contentType)
  const live = await readLiveLimit(input)
  const limit = live?.quotaTotal ?? cap.limit
  const published = await socialPostPaceRepository.listPublishedSince({
    contentTypes: contentTypesCountedWith(target.provider, target.contentType),
    destinationId: target.destinationId,
    since: new Date(now.getTime() - PUBLISH_CAP_WINDOW_MS),
    workspaceId: target.workspaceId,
  })
  const overOwn = published.length >= limit
  const overLive = live !== null && live.quotaUsage >= limit
  if (!(overOwn || overLive)) {
    return null
  }
  const leaving = overOwn
    ? published.at(-limit)
    : // The live count is over but ours is not (other posts count too): the
      // oldest of ours is the best guess; with none, look again in an hour.
      published[0]
  const until = leaving
    ? new Date(leaving.getTime() + PUBLISH_CAP_WINDOW_MS)
    : new Date(now.getTime() + CAP_RECHECK_MS)
  return new Date(Math.max(until.getTime(), now.getTime() + MIN_DEFER_MS))
}

type QuotaRead = (request: {
  accessToken: string
  destinationExternalId: string
}) => Promise<SocialPublishingLimit | null>

/** A reply or delete quota read (cached about 5 minutes per destination); `null` when absent or the call failed. */
const readCachedQuota = async (input: {
  accessToken: string
  cacheKey: string
  destinationExternalId: string
  read: QuotaRead | undefined
}): Promise<SocialPublishingLimit | null> => {
  const { read } = input
  if (!read) {
    return null
  }
  try {
    return await withCache<SocialPublishingLimit | null>(
      input.cacheKey,
      () =>
        read({
          accessToken: input.accessToken,
          destinationExternalId: input.destinationExternalId,
        }),
      { ttl: LIVE_LIMIT_CACHE_SECONDS },
    )
  } catch (err) {
    logger.warn(
      { err: logSafe(err), cacheKey: input.cacheKey },
      "social-post pace: reading a live quota failed",
    )
    return null
  }
}

/**
 * The network's reply quota (Threads: 1000 per rolling 24 hours, read from
 * `reply_quota_usage` / `reply_config`) for follow-up parts. When it is used up
 * the part waits (never fails, never spends an attempt) and the quota is read
 * again after an hour. `null` when there is room or the quota cannot be read.
 */
export const replyQuotaDeferral = async (input: {
  accessToken: string
  destinationExternalId: string
  destinationId: string
  now: Date
  publisher: Pick<SocialPublisher, "getReplyLimit">
}): Promise<Date | null> => {
  const live = await readCachedQuota({
    accessToken: input.accessToken,
    cacheKey: `post-publish:reply-limit:${input.destinationId}`,
    destinationExternalId: input.destinationExternalId,
    read: input.publisher.getReplyLimit,
  })
  if (!live || live.quotaUsage < live.quotaTotal) {
    return null
  }
  return new Date(input.now.getTime() + CAP_RECHECK_MS)
}

/** When the destination's spacing allows the next publish, plus jitter. */
export const spacingDeferral = async (input: PaceInput): Promise<Date> => {
  const { now, target } = input
  const limits = PROVIDER_PUBLISH_LIMITS[target.provider]
  const pace = await socialPostPaceRepository.findPace({
    destinationId: target.destinationId,
    workspaceId: target.workspaceId,
  })
  const last = pace?.lastPublishStartedAt ?? now
  const base = new Date(last.getTime() + limits.minGapMs)
  return new Date(
    Math.max(
      withJitter(base.getTime(), limits.jitterMaxMs, input.random),
      now.getTime() + MIN_DEFER_MS,
    ),
  )
}

export const checkPace = async (input: PaceInput): Promise<PaceDecision> => {
  const { now, target } = input
  const limits = PROVIDER_PUBLISH_LIMITS[target.provider]

  const pace = await socialPostPaceRepository.findPace({
    destinationId: target.destinationId,
    workspaceId: target.workspaceId,
  })
  if (pace?.pausedUntil && pace.pausedUntil.getTime() > now.getTime()) {
    return { kind: "defer", reason: "paused", until: pace.pausedUntil }
  }

  const capUntil = await dailyCapDeferral(input)
  if (capUntil) {
    return { kind: "defer", reason: "dailyCap", until: capUntil }
  }

  const key = slotKey(target.provider)
  let slotHeld = false
  try {
    slotHeld = await concurrencySlots.acquire({
      holder: target.id,
      key,
      limit: limits.maxConcurrentJobs,
      ttlMs: SOCIAL_POST_LEASE_MS,
    })
  } catch (err) {
    // Redis is the pace's helper, not a dependency of publishing: fail open.
    logger.warn(
      { err: logSafe(err), targetId: target.id },
      "social-post pace: the provider slot check failed, publishing anyway",
    )
    slotHeld = true
  }
  const random = input.random ?? Math.random
  if (!slotHeld) {
    const span = CONCURRENCY_DEFER_MAX_MS - CONCURRENCY_DEFER_MIN_MS
    return {
      kind: "defer",
      reason: "providerBusy",
      until: new Date(
        now.getTime() + CONCURRENCY_DEFER_MIN_MS + Math.floor(random() * span),
      ),
    }
  }
  const releaseSlot = async (): Promise<void> => {
    try {
      await concurrencySlots.release({ holder: target.id, key })
    } catch (err) {
      logger.warn(
        { err: logSafe(err), targetId: target.id },
        "social-post pace: releasing the provider slot failed (it expires on its own)",
      )
    }
  }

  // From here a throw must not strand the slot: the caller only learns of
  // `releaseSlot` from a "go", so give it back before rethrowing.
  try {
    const reserved = await socialPostPaceRepository.reservePublishSlot({
      destinationId: target.destinationId,
      gapMs: limits.minGapMs,
      now,
      workspaceId: target.workspaceId,
    })
    if (!reserved) {
      const until = await spacingDeferral(input)
      await releaseSlot()
      return { kind: "defer", reason: "spacing", until }
    }
  } catch (err) {
    await releaseSlot()
    throw err
  }
  return { kind: "go", releaseSlot }
}
