import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  ne,
  sql,
} from "../../client"
import type { SocialProvider } from "../../partials/social-account"
import type {
  SocialContentType,
  SocialPostPartKind,
  SocialPostPartStatus,
  SocialPostTargetStatus,
} from "../../partials/social-post"
import {
  inboxModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
  socialPostModel,
  socialPostTargetModel,
  socialPostTargetPartModel,
} from "../../schema"
import {
  targetDestinationJoins,
  targetPublishDestinationColumns,
} from "./columns"
import type {
  SocialTargetContinuation,
  SocialTargetError,
  SocialTargetOutcome,
} from "./publishing-types"

/** What one attempt decided for a part: a target outcome without the head-only kind. */
export type SocialPartOutcome = Exclude<
  SocialTargetOutcome,
  { kind: "headPublished" }
>

export type SocialPartInsert = {
  id: string
  kind: SocialPostPartKind
  position: number
  socialPostTargetId: string
  text: string
  workspaceId: string
}

/** A part as the API and the composer read it. */
export type SocialPartRow = {
  attemptCount: number
  errorCategory: string | null
  errorCode: string | null
  errorMessage: string | null
  externalPostId: string | null
  id: string
  kind: SocialPostPartKind
  nextAttemptAt: Date | null
  permalink: string | null
  position: number
  publishedAt: Date | null
  socialPostTargetId: string
  status: SocialPostPartStatus
  text: string
}

/** A part taken by a worker: the lease is the fence every later write presents. */
export type ClaimedSocialPart = { attemptCount: number; leaseUntil: Date }

/** A part whose lease ran out, taken over by the recovery scan. */
export type ExpiredSocialPart = {
  attemptCount: number
  continuation: SocialTargetContinuation | null
  id: string
  leaseUntil: Date
  position: number
  publishStartedAt: Date | null
  socialPostId: string
  socialPostTargetId: string
  status: SocialPostPartStatus
  workspaceId: string
}

/** What a publish attempt needs: the part with its target's and destination's identity. */
export type SocialPartForPublish = {
  /** The TikTok publishing login; `null` for a destination published with an inbox token. */
  accountId: string | null
  accountStatus: "connected" | "needsReauth" | "disconnected" | null
  attemptCount: number
  contentType: SocialContentType
  continuation: SocialTargetContinuation | null
  /** The TikTok destination's external id; `null` for the inbox networks (see the credential source). */
  destinationExternalId: string | null
  destinationId: string
  destinationIsActive: boolean
  headExternalPostId: string | null
  id: string
  inboxId: string | null
  kind: SocialPostPartKind
  options: Record<string, boolean | string | number>
  position: number
  provider: SocialProvider
  publishStartedAt: Date | null
  /** Limit-answer retries already used (their own budget). */
  rateLimitAttempts: number
  socialPostId: string
  socialPostTargetId: string
  status: SocialPostPartStatus
  targetStatus: SocialPostTargetStatus
  text: string
  workspaceId: string
}

const partColumns = {
  attemptCount: socialPostTargetPartModel.attemptCount,
  errorCategory: socialPostTargetPartModel.errorCategory,
  errorCode: socialPostTargetPartModel.errorCode,
  errorMessage: socialPostTargetPartModel.errorMessage,
  externalPostId: socialPostTargetPartModel.externalPostId,
  id: socialPostTargetPartModel.id,
  kind: socialPostTargetPartModel.kind,
  nextAttemptAt: socialPostTargetPartModel.nextAttemptAt,
  permalink: socialPostTargetPartModel.permalink,
  position: socialPostTargetPartModel.position,
  publishedAt: socialPostTargetPartModel.publishedAt,
  socialPostTargetId: socialPostTargetPartModel.socialPostTargetId,
  status: socialPostTargetPartModel.status,
  text: socialPostTargetPartModel.text,
}

const clearedColumns = {
  errorCategory: null,
  errorCode: null,
  errorMessage: null,
  leaseExpiresAt: null,
  nextAttemptAt: null,
}

const errorOf = (error: SocialTargetError | null) => ({
  errorCategory: error?.category ?? null,
  errorCode: error?.code ?? null,
  errorMessage: error?.message ?? null,
})

const outcomeColumns = (outcome: SocialPartOutcome) => {
  switch (outcome.kind) {
    case "published":
      return {
        ...clearedColumns,
        continuation: null,
        externalPostId: outcome.externalPostId,
        permalink: outcome.permalink,
        publishedAt: outcome.publishedAt,
        status: "published" as const,
      }
    case "processing":
      return {
        continuation: outcome.continuation,
        leaseExpiresAt: outcome.nextCheckAt,
        status: "processing" as const,
      }
    case "retry":
      return {
        ...clearedColumns,
        ...errorOf(outcome.error),
        continuation: null,
        nextAttemptAt: outcome.nextAttemptAt,
        publishStartedAt: null,
        status: "pending" as const,
        // A limit answer is a budget apart from the attempts: it gives the
        // attempt back and counts in `rateLimitAttempts` (as a target does).
        ...(outcome.budget === "rateLimit"
          ? {
              attemptCount: sql`GREATEST(${socialPostTargetPartModel.attemptCount} - 1, 0)`,
              rateLimitAttempts: sql`${socialPostTargetPartModel.rateLimitAttempts} + 1`,
            }
          : {}),
      }
    case "failed":
      return {
        ...clearedColumns,
        ...errorOf(outcome.error),
        ...(outcome.giveAttemptBack
          ? {
              attemptCount: sql`GREATEST(${socialPostTargetPartModel.attemptCount} - 1, 0)`,
              publishStartedAt: null,
            }
          : {}),
        status: "failed" as const,
      }
    case "needsReview":
      return {
        ...clearedColumns,
        ...errorOf(outcome.error),
        status: "needsReview" as const,
      }
    default: {
      const exhaustive: never = outcome
      return exhaustive
    }
  }
}

const toDate = (value: Date | string): Date => new Date(value)

/**
 * The part pipeline's writes on `SocialPostTargetPart`. Same discipline as the
 * target pipeline: every state change is one conditional UPDATE, a claim takes a
 * lease, every later write presents it. A part may start only when every part
 * before it is `published` and its target is `processing` (the head is out).
 */
export const socialPostPartRepository = {
  async insertMany(
    rows: readonly SocialPartInsert[],
    tx: DatabaseClient,
  ): Promise<void> {
    if (rows.length > 0) {
      await tx.insert(socialPostTargetPartModel).values([...rows])
    }
  },

  async deleteForTarget(
    input: { socialPostTargetId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .delete(socialPostTargetPartModel)
      .where(
        and(
          eq(
            socialPostTargetPartModel.socialPostTargetId,
            input.socialPostTargetId,
          ),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /** The parts of the given targets in position order. */
  async listForTargets(
    input: { targetIds: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPartRow[]> {
    if (input.targetIds.length === 0) {
      return []
    }
    return await tx
      .select(partColumns)
      .from(socialPostTargetPartModel)
      .where(
        and(
          inArray(socialPostTargetPartModel.socialPostTargetId, [
            ...input.targetIds,
          ]),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(
        asc(socialPostTargetPartModel.socialPostTargetId),
        asc(socialPostTargetPartModel.position),
      )
  },

  /** The first part that is not published yet: where a retry or a resolve acts. */
  async firstUnsettled(
    input: { socialPostTargetId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPartRow | null> {
    const [row] = await tx
      .select(partColumns)
      .from(socialPostTargetPartModel)
      .where(
        and(
          eq(
            socialPostTargetPartModel.socialPostTargetId,
            input.socialPostTargetId,
          ),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          ne(socialPostTargetPartModel.status, "published"),
        ),
      )
      .orderBy(asc(socialPostTargetPartModel.position))
      .limit(1)
    return row ?? null
  },

  /**
   * Takes one part: `pending` becomes `publishing` with a lease and a new
   * attempt number, and the previous marker is cleared. `null` when another
   * worker took it, it is not due (`nextAttemptAt` is later than `now` plus
   * `dueWindowMs`, the scan's push-back), an earlier part is not published, or the
   * target is not `processing` (the head is not out, or the target ended).
   */
  async claim(
    input: {
      /** How far ahead of `now` a `nextAttemptAt` still counts as due (the scan's push-back). */
      dueWindowMs: number
      id: string
      leaseUntil: Date
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<ClaimedSocialPart | null> {
    const dueBy = new Date(input.now.getTime() + input.dueWindowMs)
    const result = await tx.execute<{ attemptCount: number }>(sql`
      UPDATE "SocialPostTargetPart" AS p
      SET "status" = 'publishing',
          "attemptCount" = p."attemptCount" + 1,
          "leaseExpiresAt" = ${input.leaseUntil}::timestamptz,
          "publishStartedAt" = NULL
      WHERE p."id" = ${input.id}
        AND p."workspaceId" = ${input.workspaceId}
        AND p."status" = 'pending'
        AND p."nextAttemptAt" IS NOT NULL
        AND p."nextAttemptAt" <= ${dueBy}::timestamptz
        AND EXISTS (
          SELECT 1 FROM "SocialPostTarget" AS t
          WHERE t."id" = p."socialPostTargetId" AND t."status" = 'processing'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "SocialPostTargetPart" AS e
          WHERE e."socialPostTargetId" = p."socialPostTargetId"
            AND e."position" < p."position"
            AND e."status" <> 'published'
        )
      RETURNING p."attemptCount" AS "attemptCount"
    `)
    const [row] = result.rows
    return row
      ? { attemptCount: row.attemptCount, leaseUntil: input.leaseUntil }
      : null
  },

  /**
   * Gives a claim back before anything was sent: the part is pending again at
   * `nextAttemptAt` and the attempt the claim counted is returned, so a
   * deferral (the reply quota) never spends an attempt. Only while the claim's
   * lease is still the stored one.
   */
  async releaseClaim(
    input: {
      fence: Date
      id: string
      nextAttemptAt: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetPartModel)
      .set({
        attemptCount: sql`GREATEST(${socialPostTargetPartModel.attemptCount} - 1, 0)`,
        leaseExpiresAt: null,
        nextAttemptAt: input.nextAttemptAt,
        publishStartedAt: null,
        status: "pending",
      })
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          eq(socialPostTargetPartModel.status, "publishing"),
          eq(socialPostTargetPartModel.leaseExpiresAt, input.fence),
        ),
      )
      .returning({ id: socialPostTargetPartModel.id })
    return rows.length > 0
  },

  /** The marker: must succeed BEFORE any call that can create the part. */
  async markStarted(
    input: { id: string; leaseUntil: Date; now: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetPartModel)
      .set({ publishStartedAt: input.now })
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          eq(socialPostTargetPartModel.status, "publishing"),
          eq(socialPostTargetPartModel.leaseExpiresAt, input.leaseUntil),
        ),
      )
      .returning({ id: socialPostTargetPartModel.id })
    return rows.length > 0
  },

  /** Stores what the attempt decided, only while the claim's lease is the stored one. */
  async settle(
    input: {
      fence: Date
      id: string
      outcome: SocialPartOutcome
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetPartModel)
      .set(outcomeColumns(input.outcome))
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetPartModel.status, [
            "publishing",
            "processing",
          ]),
          eq(socialPostTargetPartModel.leaseExpiresAt, input.fence),
        ),
      )
      .returning({
        socialPostTargetId: socialPostTargetPartModel.socialPostTargetId,
      })
    return row?.socialPostTargetId ?? null
  },

  /**
   * Due pending parts (a retry or a part the queue lost), each pushed forward in
   * the same statement so the next tick does not take it again.
   */
  async claimDue(
    input: { limit: number; now: Date; pushBackUntil: Date },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    const result = await tx.execute<{ id: string; workspaceId: string }>(sql`
      UPDATE "SocialPostTargetPart" AS p
      SET "nextAttemptAt" = ${input.pushBackUntil}::timestamptz
      WHERE p."id" IN (
        SELECT s."id" FROM "SocialPostTargetPart" AS s
        WHERE s."status" = 'pending'
          AND s."nextAttemptAt" <= ${input.now}::timestamptz
        ORDER BY s."nextAttemptAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING p."id"::text AS "id", p."workspaceId"::text AS "workspaceId"
    `)
    return result.rows
  },

  /** Takes parts whose lease ran out (a crashed worker, or a container due to be read again). */
  async claimExpired(
    input: { leaseUntil: Date; limit: number; now: Date },
    tx: DatabaseClient = db,
  ): Promise<ExpiredSocialPart[]> {
    const result = await tx.execute<{
      attemptCount: number
      continuation: SocialTargetContinuation | null
      id: string
      position: number
      publishStartedAt: Date | string | null
      socialPostId: string
      socialPostTargetId: string
      status: SocialPostPartStatus
      workspaceId: string
    }>(sql`
      UPDATE "SocialPostTargetPart" AS p
      SET "leaseExpiresAt" = ${input.leaseUntil}::timestamptz
      WHERE p."id" IN (
        SELECT s."id" FROM "SocialPostTargetPart" AS s
        WHERE s."status" IN ('publishing', 'processing')
          AND s."leaseExpiresAt" < ${input.now}::timestamptz
        ORDER BY s."leaseExpiresAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING p."id"::text AS "id", p."workspaceId"::text AS "workspaceId",
        p."socialPostTargetId"::text AS "socialPostTargetId",
        (SELECT t."socialPostId"::text FROM "SocialPostTarget" AS t WHERE t."id" = p."socialPostTargetId") AS "socialPostId",
        p."status" AS "status", p."attemptCount" AS "attemptCount",
        p."continuation" AS "continuation", p."publishStartedAt" AS "publishStartedAt",
        p."position" AS "position"
    `)
    return result.rows.map((row) => ({
      attemptCount: row.attemptCount,
      continuation: row.continuation,
      id: row.id,
      leaseUntil: input.leaseUntil,
      position: row.position,
      publishStartedAt: row.publishStartedAt
        ? toDate(row.publishStartedAt)
        : null,
      socialPostId: row.socialPostId,
      socialPostTargetId: row.socialPostTargetId,
      status: row.status,
      workspaceId: row.workspaceId,
    }))
  },

  /**
   * The part a recovery job was handed, only while the lease the scan gave it
   * is still the stored one. `null` when the claim moved on: the job does nothing.
   */
  async findExpiredClaim(
    input: { id: string; leaseUntil: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ExpiredSocialPart | null> {
    const result = await tx.execute<{
      attemptCount: number
      continuation: SocialTargetContinuation | null
      id: string
      position: number
      publishStartedAt: Date | string | null
      socialPostId: string
      socialPostTargetId: string
      status: SocialPostPartStatus
      workspaceId: string
    }>(sql`
      SELECT p."id"::text AS "id", p."workspaceId"::text AS "workspaceId",
        p."socialPostTargetId"::text AS "socialPostTargetId",
        (SELECT t."socialPostId"::text FROM "SocialPostTarget" AS t WHERE t."id" = p."socialPostTargetId") AS "socialPostId",
        p."status" AS "status", p."attemptCount" AS "attemptCount",
        p."continuation" AS "continuation", p."publishStartedAt" AS "publishStartedAt",
        p."position" AS "position"
      FROM "SocialPostTargetPart" AS p
      WHERE p."id" = ${input.id}
        AND p."workspaceId" = ${input.workspaceId}
        AND p."status" IN ('publishing', 'processing')
        AND p."leaseExpiresAt" = ${input.leaseUntil}::timestamptz
      LIMIT 1
    `)
    const [row] = result.rows
    return row
      ? {
          ...row,
          leaseUntil: input.leaseUntil,
          publishStartedAt: row.publishStartedAt
            ? toDate(row.publishStartedAt)
            : null,
        }
      : null
  },

  /** A failed or unconfirmed part goes back to the queue, due now, with a fresh attempt count. */
  async resetForRetry(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetPartModel)
      .set({
        attemptCount: 0,
        continuation: null,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        nextAttemptAt: input.now,
        rateLimitAttempts: 0,
        publishStartedAt: null,
        status: "pending",
      })
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetPartModel.status, ["failed", "needsReview"]),
        ),
      )
      .returning({
        socialPostTargetId: socialPostTargetPartModel.socialPostTargetId,
      })
    return row?.socialPostTargetId ?? null
  },

  /** A person confirmed an unconfirmed part is on the network. */
  async resolveAsPublished(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetPartModel)
      .set({
        ...clearedColumns,
        continuation: null,
        publishedAt: input.now,
        status: "published",
      })
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          eq(socialPostTargetPartModel.status, "needsReview"),
        ),
      )
      .returning({
        socialPostTargetId: socialPostTargetPartModel.socialPostTargetId,
      })
    return row?.socialPostTargetId ?? null
  },

  /** Makes the first part due now: the head just went out. `false` when none was pending. */
  async startFirst(
    input: { now: Date; socialPostTargetId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const next = await this.firstUnsettled(input, tx)
    if (next?.status !== "pending") {
      return null
    }
    const rows = await tx
      .update(socialPostTargetPartModel)
      .set({ nextAttemptAt: input.now })
      .where(
        and(
          eq(socialPostTargetPartModel.id, next.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          eq(socialPostTargetPartModel.status, "pending"),
        ),
      )
      .returning({ id: socialPostTargetPartModel.id })
    return rows.length > 0 ? next.id : null
  },

  async findForPublish(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPartForPublish | null> {
    const joins = targetDestinationJoins(input.workspaceId)
    const [row] = await tx
      .select({
        ...targetPublishDestinationColumns(),
        attemptCount: socialPostTargetPartModel.attemptCount,
        contentType: socialPostTargetModel.contentType,
        continuation: socialPostTargetPartModel.continuation,
        headExternalPostId: socialPostTargetModel.externalPostId,
        id: socialPostTargetPartModel.id,
        kind: socialPostTargetPartModel.kind,
        options: socialPostTargetModel.options,
        position: socialPostTargetPartModel.position,
        provider: socialPostTargetModel.provider,
        publishStartedAt: socialPostTargetPartModel.publishStartedAt,
        rateLimitAttempts: socialPostTargetPartModel.rateLimitAttempts,
        socialPostId: socialPostTargetModel.socialPostId,
        socialPostTargetId: socialPostTargetPartModel.socialPostTargetId,
        status: socialPostTargetPartModel.status,
        targetStatus: socialPostTargetModel.status,
        text: socialPostTargetPartModel.text,
        workspaceId: socialPostTargetPartModel.workspaceId,
      })
      .from(socialPostTargetPartModel)
      .innerJoin(
        socialPostTargetModel,
        eq(
          socialPostTargetModel.id,
          socialPostTargetPartModel.socialPostTargetId,
        ),
      )
      .innerJoin(
        socialPostModel,
        eq(socialPostModel.id, socialPostTargetModel.socialPostId),
      )
      .innerJoin(publishDestinationModel, joins.binding)
      .leftJoin(inboxModel, joins.inbox)
      .leftJoin(socialAccountDestinationModel, joins.socialDestination)
      .leftJoin(socialAccountModel, joins.socialAccount)
      .where(
        and(
          eq(socialPostTargetPartModel.id, input.id),
          eq(socialPostTargetPartModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },
}
