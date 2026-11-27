import { z } from "zod"
import type { SocialContentType, SocialProvider } from "./social-account"

/**
 * The publishing pace registry (pure; Edge-safe): how fast and how much one
 * destination may publish before the pipeline slows down on its own.
 *
 * Every number carries its source. `official` = stated in the platform's own
 * documentation (URL in `docs/posts.md`, "Publishing pace and platform limits");
 * `default` = OUR conservative choice because the platform documents no number.
 * A `default` is never presented as a platform fact.
 */

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

/** The rolling window every daily cap is counted over. */
export const PUBLISH_CAP_WINDOW_MS = 24 * HOUR_MS

/** A wait is never longer than this, whatever a platform hint says. */
export const MAX_PUBLISH_WAIT_MS = 24 * HOUR_MS

export type PublishLimitSource = "default" | "official"

export type PublishDailyCap = {
  /** Number counted over the rolling 24 hours. */
  limit: number
  source: PublishLimitSource
}

export type ProviderPublishLimits = {
  /** Our default: minimum time between two publish starts on one destination. */
  minGapMs: number
  /** Our default: random extra wait (0 to this) added when a publish is pushed back. */
  jitterMaxMs: number
  /** Our default: concurrent publish jobs for one network across all workers. */
  maxConcurrentJobs: number
  /**
   * Cap on posts per rolling 24 hours, counted from our own published targets.
   * For Instagram and Threads this is only the fallback: the live
   * `content_publishing_limit` / `threads_publishing_limit` answer wins.
   */
  dailyCap: PublishDailyCap
}

/**
 * Per network. Official: Instagram 100 (guide) / 50 (reference), Threads 250,
 * Facebook Reels 30. Everything else is our default.
 * Instagram's own docs disagree (100 in the guide, 50 in the
 * `content_publishing_limit` reference), so the fallback is the lower one.
 */
export const PROVIDER_PUBLISH_LIMITS: Readonly<
  Record<SocialProvider, ProviderPublishLimits>
> = {
  facebook: {
    dailyCap: { limit: 25, source: "default" },
    jitterMaxMs: 90 * SECOND_MS,
    maxConcurrentJobs: 3,
    minGapMs: 5 * MINUTE_MS,
  },
  instagram: {
    dailyCap: { limit: 50, source: "official" },
    jitterMaxMs: 90 * SECOND_MS,
    maxConcurrentJobs: 2,
    minGapMs: 10 * MINUTE_MS,
  },
  threads: {
    dailyCap: { limit: 250, source: "official" },
    jitterMaxMs: 90 * SECOND_MS,
    maxConcurrentJobs: 2,
    minGapMs: 5 * MINUTE_MS,
  },
  tiktok: {
    dailyCap: { limit: 15, source: "default" },
    jitterMaxMs: 90 * SECOND_MS,
    maxConcurrentJobs: 1,
    minGapMs: 15 * MINUTE_MS,
  },
}

/** Official: Facebook Reels API, 30 API-published posts per 24-hour moving period. */
export const FACEBOOK_REELS_DAILY_CAP: PublishDailyCap = {
  limit: 30,
  source: "official",
}

const FACEBOOK_FEED_CONTENT_TYPES: readonly SocialContentType[] = [
  "text",
  "link",
  "image",
  "video",
  "carousel",
  "story",
]

/** The daily cap that applies to one content type of one network. */
export const dailyCapFor = (
  provider: SocialProvider,
  contentType: SocialContentType,
): PublishDailyCap =>
  provider === "facebook" && contentType === "reel"
    ? FACEBOOK_REELS_DAILY_CAP
    : PROVIDER_PUBLISH_LIMITS[provider].dailyCap

/**
 * Content types counted together against one cap. Facebook feed posts and
 * Reels have separate caps and are counted apart.
 */
export const contentTypesCountedWith = (
  provider: SocialProvider,
  contentType: SocialContentType,
): readonly SocialContentType[] | null => {
  if (provider !== "facebook") {
    return null
  }
  return contentType === "reel" ? ["reel"] : FACEBOOK_FEED_CONTENT_TYPES
}

/** Our default: how long a live `content_publishing_limit` / `threads_publishing_limit` answer is reused. */
export const LIVE_LIMIT_CACHE_SECONDS = 5 * 60

/** Our default: a target pushed back because the provider's job slots are full waits 30 to 60 s. */
export const CONCURRENCY_DEFER_MIN_MS = 30 * SECOND_MS
export const CONCURRENCY_DEFER_MAX_MS = 60 * SECOND_MS

/**
 * Our default: waits after a rate-limit answer, one per rate-limit retry, with
 * their own budget (the transient 5/15/60 minute ladder is untouched). After
 * the last one the target fails with `RATE_LIMIT_EXHAUSTED_CODE`.
 */
export const RATE_LIMIT_BACKOFF_MS: readonly number[] = [
  1 * HOUR_MS,
  2 * HOUR_MS,
  4 * HOUR_MS,
]
export const RATE_LIMIT_JITTER_MAX_MS = 5 * MINUTE_MS
/** Our default: the wait after a per-token, per-minute throttle (TikTok `rate_limit_exceeded`). */
export const TOKEN_THROTTLE_WAIT_MS = MINUTE_MS
export const RATE_LIMIT_EXHAUSTED_CODE = "publishRateLimitExhausted"

/**
 * Why a destination is paused. `limitReached`: the network's rate or daily
 * limit answered twice in a row. `accountRestricted`: the network restricted
 * the account. `spamRisk`: a spam-risk answer (TikTok).
 */
export const publishPauseReasons = z.enum([
  "limitReached",
  "accountRestricted",
  "spamRisk",
])
export type PublishPauseReason = z.infer<typeof publishPauseReasons>

/** Our defaults: consecutive account-level limit, restriction or spam answers that pause a destination, and for how long. */
export const PAUSE_AFTER_CONSECUTIVE_LIMIT_ERRORS = 2
export const PUBLISH_PAUSE_MS: Readonly<Record<PublishPauseReason, number>> = {
  accountRestricted: 24 * HOUR_MS,
  limitReached: 6 * HOUR_MS,
  spamRisk: 24 * HOUR_MS,
}
/**
 * Whether an error is the account's (pauses its destination), the app's (backs
 * the target off only) or the access token's (a per-minute request throttle:
 * a short retry that neither pauses the destination nor spends the ladder).
 */
export const publishErrorScopes = z.enum(["account", "app", "token"])
export type PublishErrorScope = z.infer<typeof publishErrorScopes>

/** Our default: the wait when X-App-Usage reports a figure at or over 100 (the header carries no time). */
export const APP_USAGE_EXHAUSTED_WAIT_MS = 15 * MINUTE_MS
/** The reading that counts as exhausted. */
export const APP_USAGE_EXHAUSTED_PERCENT = 100

/** Adds a random 0..max jitter; `random` is injectable for tests. */
export const withJitter = (
  baseMs: number,
  maxJitterMs: number,
  random: () => number = Math.random,
): number => baseMs + Math.floor(random() * (maxJitterMs + 1))

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0

/**
 * Reads the answer of Instagram's `content_publishing_limit` and Threads'
 * `threads_publishing_limit`: `{ data: [{ quota_usage, config: { quota_total } }] }`.
 * `null` when the answer has another shape (the caller falls back to the
 * documented number).
 */
export const parsePublishingLimit = (
  body: Record<string, unknown>,
): { quotaTotal: number; quotaUsage: number } | null => {
  const first = Array.isArray(body.data) ? body.data[0] : undefined
  if (typeof first !== "object" || first === null) {
    return null
  }
  const entry = first as {
    config?: { quota_total?: unknown }
    quota_usage?: unknown
  }
  const total = entry.config?.quota_total
  const usage = entry.quota_usage
  return isCount(total) && total > 0 && isCount(usage)
    ? { quotaTotal: total, quotaUsage: usage }
    : null
}

/** The other Threads quotas `threads_publishing_limit` reports: replies and deletes, each with its own usage and config fields. */
export const THREADS_QUOTA_FIELDS = {
  delete: { config: "delete_config", usage: "delete_quota_usage" },
  reply: { config: "reply_config", usage: "reply_quota_usage" },
} as const
export type ThreadsQuotaKind = keyof typeof THREADS_QUOTA_FIELDS

/**
 * Reads one of the Threads quotas of `threads_publishing_limit`
 * (`reply_quota_usage` / `reply_config.quota_total`, `delete_quota_usage` /
 * `delete_config.quota_total`; documented at
 * https://developers.facebook.com/docs/threads/troubleshooting#retrieve-quota-limits).
 * `null` when the answer has another shape.
 */
export const parseThreadsQuota = (
  body: Record<string, unknown>,
  kind: ThreadsQuotaKind,
): { quotaTotal: number; quotaUsage: number } | null => {
  const first = Array.isArray(body.data) ? body.data[0] : undefined
  if (typeof first !== "object" || first === null) {
    return null
  }
  const entry = first as Record<string, unknown>
  const fields = THREADS_QUOTA_FIELDS[kind]
  const config = entry[fields.config]
  const total =
    typeof config === "object" && config !== null
      ? (config as { quota_total?: unknown }).quota_total
      : undefined
  const usage = entry[fields.usage]
  return isCount(total) && total > 0 && isCount(usage)
    ? { quotaTotal: total, quotaUsage: usage }
    : null
}

/** More than this many steps means the inputs are absurd; stop instead of looping. */
const AUTO_SLOT_MAX_STEPS = 10_000

/**
 * Queue placement for a destination that has NO posting schedule ("auto
 * spacing"): the next `count` instants after `after` that keep at least `gapMs`
 * from every `taken` instant (queued slots and recent publishes) and keep the
 * rolling 24 hours under `capLimit`. Best effort: the pace gate at publish time
 * is the authority, and defers whatever this misjudged.
 */
export const listAutoSpacedSlots = (input: {
  after: Date
  capLimit: number
  count: number
  gapMs: number
  taken: readonly Date[]
}): Date[] => {
  if (input.capLimit <= 0) {
    return []
  }
  const times = input.taken.map((instant) => instant.getTime())
  times.sort((a, b) => a - b)
  const found: Date[] = []
  let candidate = input.after.getTime() + 1
  let steps = 0
  while (found.length < input.count && steps < AUTO_SLOT_MAX_STEPS) {
    steps += 1
    const clash = times.find((t) => Math.abs(t - candidate) < input.gapMs)
    if (clash !== undefined) {
      candidate = clash + input.gapMs
      continue
    }
    const inWindow = times.filter(
      (t) => t > candidate - PUBLISH_CAP_WINDOW_MS && t <= candidate,
    )
    if (inWindow.length >= input.capLimit) {
      const leaving = inWindow.at(-input.capLimit)
      if (leaving !== undefined) {
        candidate = leaving + PUBLISH_CAP_WINDOW_MS
        continue
      }
    }
    found.push(new Date(candidate))
    times.push(candidate)
    times.sort((a, b) => a - b)
  }
  return found
}
