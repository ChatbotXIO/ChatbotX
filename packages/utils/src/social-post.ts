import { z } from "zod"

/**
 * Where a composed post stands.
 * - `draft`: saved, never scheduled.
 * - `scheduled`: at least one target waits for its time.
 * - `publishing`: a target is being published right now.
 * - `published`: every target is published.
 * - `partiallyPublished`: some targets published, others failed or were cancelled.
 * - `failed`: no target published and none will be retried.
 * - `cancelled`: every target was cancelled.
 */
export const socialPostStatuses = z.enum([
  "draft",
  "scheduled",
  "publishing",
  "published",
  "partiallyPublished",
  "failed",
  "cancelled",
])
export type SocialPostStatus = z.infer<typeof socialPostStatuses>

/**
 * The groups the posts list is filtered and counted by. A post is in exactly
 * one, the first that fits:
 * - `needsAttention`: failed, partially published, or a destination that
 *   failed or waits for a person (`needsReview`).
 * - `drafts`: a draft.
 * - `scheduled`: scheduled, or being published without anything needing attention.
 * - `published`: every destination published.
 * A cancelled post is in none (it only shows under "All").
 */
export const socialPostBuckets = z.enum([
  "drafts",
  "scheduled",
  "published",
  "needsAttention",
])
export type SocialPostBucket = z.infer<typeof socialPostBuckets>

/** Where one destination of a post stands. `needsReview` waits for a person (an unconfirmed publish). */
export const socialPostTargetStatuses = z.enum([
  "pending",
  "publishing",
  "processing",
  "published",
  "failed",
  "cancelled",
  "needsReview",
])
export type SocialPostTargetStatus = z.infer<typeof socialPostTargetStatuses>

/** What a follow-up part of a target is: a thread reply chained to the head, or the first comment. */
export const socialPostPartKinds = z.enum(["threadPart", "firstComment"])
export type SocialPostPartKind = z.infer<typeof socialPostPartKinds>

/** Where one follow-up part stands: the target's statuses a part can have. */
export const socialPostPartStatuses = socialPostTargetStatuses.extract([
  "pending",
  "publishing",
  "processing",
  "published",
  "failed",
  "needsReview",
])
export type SocialPostPartStatus = z.infer<typeof socialPostPartStatuses>

/** `custom` publishes at `scheduledAt`; `queue` takes the destination's next free posting slot. */
export const socialPostScheduleModes = z.enum(["custom", "queue"])
export type SocialPostScheduleMode = z.infer<typeof socialPostScheduleModes>

/** Where a post was composed: the page, the public API, or a feed auto-poster. */
export const socialPostCreatedVia = z.enum(["ui", "api", "feed"])
export type SocialPostCreatedVia = z.infer<typeof socialPostCreatedVia>

/** What a stored media file is, as far as the publishing rules care. */
export const socialMediaKinds = z.enum(["image", "video"])
export type SocialMediaKind = z.infer<typeof socialMediaKinds>

/**
 * Where a post takes its place in a destination's queue: the `next` free
 * posting time, or the `top` (the earliest time, pushing the queued posts one
 * time later).
 */
export const socialQueuePositions = z.enum(["next", "top"])
export type SocialQueuePosition = z.infer<typeof socialQueuePositions>

/**
 * What a removal request did with one destination.
 * - `queued`: a worker job takes the post down; `removedAt` (or the target's
 *   error fields) tell the result later.
 * - `removed`: already taken down, nothing to do.
 * - `unsupported`: the network or login offers no delete (Instagram Login, TikTok); the post stays published.
 * - `notPublished`: nothing is on the network, so nothing to remove.
 */
export const socialTargetRemovalStatuses = z.enum([
  "queued",
  "removed",
  "unsupported",
  "notPublished",
])
export type SocialTargetRemovalStatus = z.infer<
  typeof socialTargetRemovalStatuses
>
