import { and, db, eq, exists, inArray, type SQL, sql } from "../../client"
import type {
  SocialPostBucket,
  SocialPostStatus,
  SocialPostTargetStatus,
} from "../../partials/social-post"
import { socialPostModel, socialPostTargetModel } from "../../schema"

/** Post states that need a person whatever their destinations say. */
const ATTENTION_POST_STATUSES: readonly SocialPostStatus[] = [
  "failed",
  "partiallyPublished",
]
/** Destination states that need a person: a failure, or an unconfirmed publish. */
const ATTENTION_TARGET_STATUSES: readonly SocialPostTargetStatus[] = [
  "failed",
  "needsReview",
]
/** Post states that wait for, or are in the middle of, going out. */
const SCHEDULED_POST_STATUSES: readonly SocialPostStatus[] = [
  "scheduled",
  "publishing",
]

/** The post needs attention: it failed, or one of its destinations did or waits for a person. */
const needsAttentionCondition = (workspaceId: string): SQL => {
  const hasAttentionTarget = exists(
    db
      .select({ one: sql`1` })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, socialPostModel.id),
          eq(socialPostTargetModel.workspaceId, workspaceId),
          inArray(socialPostTargetModel.status, [...ATTENTION_TARGET_STATUSES]),
        ),
      ),
  )
  return sql`(${inArray(socialPostModel.status, [...ATTENTION_POST_STATUSES])} OR ${hasAttentionTarget})`
}

/**
 * The SQL predicate of one bucket. A post is in exactly one bucket (the first
 * that fits: attention, then its own state), so the buckets never overlap and
 * the list a count opens is the posts the count counted.
 */
export const bucketCondition = (
  bucket: SocialPostBucket,
  workspaceId: string,
): SQL => {
  const attention = needsAttentionCondition(workspaceId)
  switch (bucket) {
    case "needsAttention":
      return attention
    case "drafts":
      return sql`(${eq(socialPostModel.status, "draft")} AND NOT ${attention})`
    case "scheduled":
      return sql`(${inArray(socialPostModel.status, [...SCHEDULED_POST_STATUSES])} AND NOT ${attention})`
    case "published":
      return sql`(${eq(socialPostModel.status, "published")} AND NOT ${attention})`
    default: {
      const exhaustive: never = bucket
      return exhaustive
    }
  }
}

export type SocialPostBucketCounts = Record<SocialPostBucket, number> & {
  /** Every post, cancelled ones included. */
  all: number
}

/** One grouped statement: every bucket's count over the posts matching `conditions`. */
export const countBuckets = async (
  workspaceId: string,
  conditions: SQL[],
): Promise<SocialPostBucketCounts> => {
  const countOf = (bucket: SocialPostBucket) =>
    sql<number>`(count(*) FILTER (WHERE ${bucketCondition(bucket, workspaceId)}))::int`
  const [row] = await db
    .select({
      all: sql<number>`count(*)::int`,
      drafts: countOf("drafts"),
      needsAttention: countOf("needsAttention"),
      published: countOf("published"),
      scheduled: countOf("scheduled"),
    })
    .from(socialPostModel)
    .where(and(...conditions))
  return {
    all: row?.all ?? 0,
    drafts: row?.drafts ?? 0,
    needsAttention: row?.needsAttention ?? 0,
    published: row?.published ?? 0,
    scheduled: row?.scheduled ?? 0,
  }
}
