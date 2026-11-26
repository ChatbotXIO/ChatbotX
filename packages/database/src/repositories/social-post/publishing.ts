import type { SQL } from "drizzle-orm"
import { and, type DatabaseClient, db, eq, inArray, sql } from "../../client"
import type { SocialProvider } from "../../partials/social-account"
import type {
  SocialPostStatus,
  SocialPostTargetStatus,
} from "../../partials/social-post"
import {
  inboxModel,
  integrationInstagramModel,
  integrationMessengerModel,
  integrationThreadsModel,
  integrationTiktokModel,
  publishDestinationModel,
  socialAccountDestinationModel,
  socialAccountModel,
  socialPostModel,
  socialPostTargetModel,
} from "../../schema"
import {
  targetDestinationJoins,
  targetPublishDestinationColumns,
} from "./columns"

import type {
  AttemptMarkResult,
  ClaimedSocialTarget,
  ExpiredSocialTarget,
  SocialDestinationInbox,
  SocialTargetContinuation,
  SocialTargetError,
  SocialTargetForPublish,
  SocialTargetOutcome,
} from "./publishing-types"

/**
 * Marks a target that just became `published` as owing one message of quota,
 * in the same UPDATE. A target that was already charged (`quotaChargedAt`) never
 * owes again, so a replayed settle cannot double-charge.
 */
const quotaChargeOwed = (): SQL<boolean> =>
  sql<boolean>`${socialPostTargetModel.quotaChargedAt} IS NULL`

const outcomeColumns = (outcome: SocialTargetOutcome) => {
  const cleared = {
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
  switch (outcome.kind) {
    case "published":
      return {
        ...cleared,
        continuation: null,
        externalPostId: outcome.externalPostId,
        permalink: outcome.permalink,
        publishedAt: outcome.publishedAt,
        queueSlotAt: null,
        quotaChargePending: quotaChargeOwed(),
        status: "published" as const,
      }
    case "headPublished":
      return {
        ...cleared,
        continuation: { phase: "parts" },
        externalPostId: outcome.externalPostId,
        permalink: outcome.permalink,
        publishedAt: outcome.publishedAt,
        queueSlotAt: null,
        status: "processing" as const,
      }
    case "processing":
      return {
        continuation: outcome.continuation,
        leaseExpiresAt: outcome.nextCheckAt,
        status: "processing" as const,
      }
    case "retry":
      return {
        ...cleared,
        ...errorOf(outcome.error),
        continuation: null,
        nextAttemptAt: outcome.nextAttemptAt,
        publishStartedAt: null,
        status: "pending" as const,
        ...(outcome.budget === "rateLimit"
          ? {
              attemptCount: sql`GREATEST(${socialPostTargetModel.attemptCount} - 1, 0)`,
              rateLimitAttempts: sql`${socialPostTargetModel.rateLimitAttempts} + 1`,
            }
          : {}),
      }
    case "failed":
      return {
        ...cleared,
        ...errorOf(outcome.error),
        ...(outcome.giveAttemptBack
          ? {
              attemptCount: sql`GREATEST(${socialPostTargetModel.attemptCount} - 1, 0)`,
              publishStartedAt: null,
            }
          : {}),
        queueSlotAt: null,
        status: "failed" as const,
      }
    case "needsReview":
      return {
        ...cleared,
        ...errorOf(outcome.error),
        queueSlotAt: null,
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
 * The publishing pipeline's writes on `SocialPostTarget`. Every state change is
 * one conditional UPDATE: a claim moves `pending` to `publishing` and takes a
 * lease; every later write presents that lease, so a worker that lost its claim
 * (lease expired, taken over by the recovery scan) changes nothing.
 */
export const socialPostPublishRepository = {
  /**
   * Makes the post's pending targets due now. `[]` when none were pending (the
   * post was already published or is publishing).
   */
  async requestPublishNow(
    input: { now: Date; socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string[]> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        nextAttemptAt: input.now,
        queueSlotAt: null,
        scheduleMode: "custom",
        scheduledAt: input.now,
      })
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.map((row) => row.id)
  },

  /**
   * Due pending targets, each marked as queued until `pushBackUntil` in the same
   * statement so the next tick does not take it again if its job is lost. The
   * mark is `leaseExpiresAt` (null on every pending target otherwise), never
   * `nextAttemptAt`: the missed-schedule sweep measures lateness from
   * `nextAttemptAt`, so a job that is dropped (a blocked owner) must not move it.
   * A target due before `lateCutoff` is left for that sweep, whatever its
   * backlog: the missed-schedule policy does not depend on the sweep's batch.
   */
  async claimDue(
    input: {
      lateCutoff: Date
      limit: number
      now: Date
      pushBackUntil: Date
    },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    const result = await tx.execute<{ id: string; workspaceId: string }>(sql`
      UPDATE "SocialPostTarget" AS t
      SET "leaseExpiresAt" = ${input.pushBackUntil}::timestamptz
      WHERE t."id" IN (
        SELECT s."id" FROM "SocialPostTarget" AS s
        WHERE s."status" = 'pending'
          AND s."nextAttemptAt" <= ${input.now}::timestamptz
          AND s."nextAttemptAt" >= ${input.lateCutoff}::timestamptz
          AND (s."leaseExpiresAt" IS NULL OR s."leaseExpiresAt" < ${input.now}::timestamptz)
        ORDER BY s."nextAttemptAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING t."id"::text AS "id", t."workspaceId"::text AS "workspaceId"
    `)
    return result.rows
  },

  /**
   * Takes one due target: `pending` becomes `publishing` with a lease and a new
   * attempt number, and the previous attempt's marker is cleared. `null` when
   * another worker took it, or it is not (or no longer) due to publish.
   */
  async claim(
    input: {
      id: string
      /** A target due before this is too late to publish; the missed sweep gives it up. */
      lateCutoff: Date
      leaseUntil: Date
      now: Date
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<ClaimedSocialTarget | null> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set({
        attemptCount: sql`${socialPostTargetModel.attemptCount} + 1`,
        leaseExpiresAt: input.leaseUntil,
        publishStartedAt: null,
        status: "publishing",
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "pending"),
          // Due: a queued job must not publish a target the user has since
          // rescheduled. The scan marks a queued target with `leaseExpiresAt`
          // and leaves `nextAttemptAt` alone, so a reschedule to any later time
          // is refused here.
          sql`${socialPostTargetModel.nextAttemptAt} <= ${input.now}`,
          // Not too late: a job queued before an outage must not publish a
          // target that has since passed the late-publish window.
          sql`${socialPostTargetModel.nextAttemptAt} >= ${input.lateCutoff}`,
        ),
      )
      .returning({ attemptCount: socialPostTargetModel.attemptCount })
    return row
      ? { attemptCount: row.attemptCount, leaseUntil: input.leaseUntil }
      : null
  },

  /**
   * Writes the attempt marker. It must succeed BEFORE any call that can create
   * a post: from here on a crash is an unconfirmed publish, never a safe retry.
   * With `reservedAt` the write is fenced on the destination's reservation: an
   * older attempt whose reservation a newer one replaced is refused
   * (`reservationTaken`), so only the latest reservation can reach the network.
   */
  async markAttemptStarted(
    input: {
      id: string
      leaseUntil: Date
      now: Date
      /** The destination reservation the pace gate wrote for this attempt. */
      reservedAt?: Date | null
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<AttemptMarkResult> {
    const reservedAt = input.reservedAt ?? null
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        publishStartedAt: input.now,
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "publishing"),
          eq(socialPostTargetModel.leaseExpiresAt, input.leaseUntil),
          reservedAt
            ? sql`EXISTS (SELECT 1 FROM ${publishDestinationModel} WHERE ${publishDestinationModel.id} = ${socialPostTargetModel.publishDestinationId} AND ${publishDestinationModel.workspaceId} = ${input.workspaceId} AND ${publishDestinationModel.lastPublishStartedAt} = ${reservedAt})`
            : undefined,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    if (rows.length > 0) {
      return "marked"
    }
    if (!reservedAt) {
      return "leaseLost"
    }
    // Zero rows: tell a lost claim from a replaced reservation.
    const [held] = await tx
      .select({ id: socialPostTargetModel.id })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "publishing"),
          eq(socialPostTargetModel.leaseExpiresAt, input.leaseUntil),
        ),
      )
    return held ? "reservationTaken" : "leaseLost"
  },

  /**
   * Gives a claim back before anything was sent: the target is pending again
   * at `nextAttemptAt` and the attempt the claim counted is returned, so a
   * deferral (spacing, cap, pause, provider slots) never spends an attempt.
   * Only while the claim's lease is still the stored one.
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
      .update(socialPostTargetModel)
      .set({
        attemptCount: sql`GREATEST(${socialPostTargetModel.attemptCount} - 1, 0)`,
        leaseExpiresAt: null,
        nextAttemptAt: input.nextAttemptAt,
        publishStartedAt: null,
        status: "pending",
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "publishing"),
          eq(socialPostTargetModel.leaseExpiresAt, input.fence),
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  /**
   * Stores what the attempt decided, only while the claim's lease is still the
   * stored one. Returns the post id, or `null` when the claim was lost.
   */
  async settle(
    input: {
      fence: Date
      id: string
      outcome: SocialTargetOutcome
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set(outcomeColumns(input.outcome))
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetModel.status, ["publishing", "processing"]),
          eq(socialPostTargetModel.leaseExpiresAt, input.fence),
        ),
      )
      .returning({ socialPostId: socialPostTargetModel.socialPostId })
    return row?.socialPostId ?? null
  },

  /**
   * Takes targets whose lease ran out (a crashed worker, or a container that is
   * due to be read again) and gives each a new lease.
   */
  async claimExpired(
    input: {
      /**
       * Claims exactly this target, and only while its stored lease still is
       * `expectedDueAt` (the delayed check job's compare-and-set); `now` is
       * then not used as the bound. Without it the scan claims every expired lease.
       */
      only?: { expectedDueAt: Date; id: string; workspaceId: string }
      leaseUntil: Date
      limit: number
      now: Date
    },
    tx: DatabaseClient = db,
  ): Promise<ExpiredSocialTarget[]> {
    const { only } = input
    const dueFilter = only
      ? sql`s."id" = ${only.id}::bigint
          AND s."workspaceId" = ${only.workspaceId}::bigint
          AND s."leaseExpiresAt" = ${only.expectedDueAt}::timestamptz`
      : sql`s."leaseExpiresAt" < ${input.now}::timestamptz`
    const result = await tx.execute<{
      attemptCount: number
      continuation: SocialTargetContinuation | null
      id: string
      publishStartedAt: Date | string | null
      socialPostId: string
      status: SocialPostTargetStatus
      workspaceId: string
    }>(sql`
      UPDATE "SocialPostTarget" AS t
      SET "leaseExpiresAt" = ${input.leaseUntil}::timestamptz
      WHERE t."id" IN (
        SELECT s."id" FROM "SocialPostTarget" AS s
        WHERE s."status" IN ('publishing', 'processing')
          AND ${dueFilter}
        ORDER BY s."leaseExpiresAt" ASC, s."id" ASC
        LIMIT ${input.limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING t."id"::text AS "id", t."workspaceId"::text AS "workspaceId",
        t."socialPostId"::text AS "socialPostId", t."status" AS "status", t."attemptCount" AS "attemptCount",
        t."continuation" AS "continuation", t."publishStartedAt" AS "publishStartedAt"
    `)
    return result.rows.map((row) => ({
      attemptCount: row.attemptCount,
      continuation: row.continuation,
      id: row.id,
      leaseUntil: input.leaseUntil,
      publishStartedAt: row.publishStartedAt
        ? toDate(row.publishStartedAt)
        : null,
      socialPostId: row.socialPostId,
      status: row.status,
      workspaceId: row.workspaceId,
    }))
  },

  /**
   * The target a recovery job was handed, only while the lease the scan gave it
   * is still the stored one. `null` when the claim moved on (settled, retaken):
   * the job then does nothing.
   */
  async findExpiredClaim(
    input: { id: string; leaseUntil: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<ExpiredSocialTarget | null> {
    const [row] = await tx
      .select({
        attemptCount: socialPostTargetModel.attemptCount,
        continuation: socialPostTargetModel.continuation,
        id: socialPostTargetModel.id,
        publishStartedAt: socialPostTargetModel.publishStartedAt,
        socialPostId: socialPostTargetModel.socialPostId,
        status: socialPostTargetModel.status,
        workspaceId: socialPostTargetModel.workspaceId,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetModel.status, ["publishing", "processing"]),
          eq(socialPostTargetModel.leaseExpiresAt, input.leaseUntil),
        ),
      )
      .limit(1)
    return row ? { ...row, leaseUntil: input.leaseUntil } : null
  },

  /** A failed or unconfirmed target goes back to the queue, due now, with a fresh attempt count. */
  async resetForRetry(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set({
        attemptCount: 0,
        rateLimitAttempts: 0,
        continuation: null,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        nextAttemptAt: input.now,
        publishStartedAt: null,
        queueSlotAt: null,
        scheduleMode: "custom",
        status: "pending",
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetModel.status, ["failed", "needsReview"]),
        ),
      )
      .returning({ socialPostId: socialPostTargetModel.socialPostId })
    return row?.socialPostId ?? null
  },

  /** A person confirmed an unconfirmed target is on the network. */
  async resolveAsPublished(
    input: { id: string; now: Date; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set({
        continuation: null,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        publishedAt: input.now,
        queueSlotAt: null,
        quotaChargePending: quotaChargeOwed(),
        status: "published",
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "needsReview"),
        ),
      )
      .returning({ socialPostId: socialPostTargetModel.socialPostId })
    return row?.socialPostId ?? null
  },

  /**
   * A target whose head is published and a part failed or needs a person goes
   * back to `processing` so the part can resume. Only a target that has its head
   * identity (`externalPostId`) qualifies: the head is never published twice.
   */
  async resumeForParts(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<string | null> {
    const [row] = await tx
      .update(socialPostTargetModel)
      .set({
        continuation: { phase: "parts" },
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        status: "processing",
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          inArray(socialPostTargetModel.status, ["failed", "needsReview"]),
          sql`${socialPostTargetModel.externalPostId} IS NOT NULL`,
        ),
      )
      .returning({ socialPostId: socialPostTargetModel.socialPostId })
    return row?.socialPostId ?? null
  },

  /**
   * The last part decided the target: every part out (`published`), or one that
   * failed / needs a person. Written under the post lock, in the transaction
   * that settled the part (the part's fence already proved the claim).
   */
  async finishFromPart(
    input: {
      error: SocialTargetError | null
      id: string
      outcome: "failed" | "needsReview" | "published"
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const base = {
      continuation: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      queueSlotAt: null,
    }
    const rows = await tx
      .update(socialPostTargetModel)
      .set(
        input.outcome === "published"
          ? {
              ...base,
              errorCategory: null,
              errorCode: null,
              errorMessage: null,
              quotaChargePending: quotaChargeOwed(),
              status: "published",
            }
          : {
              ...base,
              errorCategory: input.error?.category ?? null,
              errorCode: input.error?.code ?? null,
              errorMessage: input.error?.message ?? null,
              status: input.outcome,
            },
      )
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "processing"),
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  /**
   * Takes the pending quota charge of a published target: only the caller that
   * flips `quotaChargePending` charges. Returns whether this call won it.
   */
  async claimQuotaCharge(
    input: { id: string; now?: Date; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({
        quotaChargedAt: input.now ?? new Date(),
        quotaChargePending: false,
      })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.quotaChargePending, true),
          sql`${socialPostTargetModel.quotaChargedAt} IS NULL`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  /** Gives a claimed charge back after the charge failed, so the sweep retries it. */
  async releaseQuotaCharge(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({ quotaChargedAt: null, quotaChargePending: true })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.quotaChargePending, false),
          sql`${socialPostTargetModel.quotaChargedAt} IS NOT NULL`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },

  /** Published targets whose quota charge is still owed, oldest first (the recovery sweep). */
  async listPendingQuotaCharges(
    input: { limit: number },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; workspaceId: string }[]> {
    return await tx
      .select({
        id: sql<string>`${socialPostTargetModel.id}::text`,
        workspaceId: sql<string>`${socialPostTargetModel.workspaceId}::text`,
      })
      .from(socialPostTargetModel)
      .where(eq(socialPostTargetModel.quotaChargePending, true))
      .orderBy(socialPostTargetModel.id)
      .limit(input.limit)
  },

  async findTargetStatus(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{
    externalPostId: string | null
    socialPostId: string
    status: SocialPostTargetStatus
  } | null> {
    const [row] = await tx
      .select({
        externalPostId: socialPostTargetModel.externalPostId,
        socialPostId: socialPostTargetModel.socialPostId,
        status: socialPostTargetModel.status,
      })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async listTargetStatuses(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<SocialPostTargetStatus[]> {
    const rows = await tx
      .select({ status: socialPostTargetModel.status })
      .from(socialPostTargetModel)
      .where(
        and(
          eq(socialPostTargetModel.socialPostId, input.socialPostId),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
        ),
      )
    return rows.map((row) => row.status)
  },

  /** Locks the post row, so concurrent target results recompute its status one after the other. */
  async lockPost(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<{ status: SocialPostStatus } | null> {
    const [row] = await tx
      .select({ status: socialPostModel.status })
      .from(socialPostModel)
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
      .for("update")
    return row ?? null
  },

  async setPostStatus(
    input: {
      completedAt: Date | null
      id: string
      status: SocialPostStatus
      workspaceId: string
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(socialPostModel)
      .set({ completedAt: input.completedAt, status: input.status })
      .where(
        and(
          eq(socialPostModel.id, input.id),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
  },

  /** The target with the post text and the destination's identity: what a publish attempt needs. */
  async findForPublish(
    input: { id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialTargetForPublish | null> {
    const joins = targetDestinationJoins(input.workspaceId)
    const [row] = await tx
      .select({
        ...targetPublishDestinationColumns(),
        accountProvider: socialPostTargetModel.provider,
        attemptCount: socialPostTargetModel.attemptCount,
        rateLimitAttempts: socialPostTargetModel.rateLimitAttempts,
        contentType: socialPostTargetModel.contentType,
        continuation: socialPostTargetModel.continuation,
        externalPostId: socialPostTargetModel.externalPostId,
        id: socialPostTargetModel.id,
        linkUrl: socialPostModel.linkUrl,
        options: socialPostTargetModel.options,
        overridesMedia: socialPostTargetModel.overridesMedia,
        permalink: socialPostTargetModel.permalink,
        partCount: sql<number>`(SELECT count(*)::int FROM "SocialPostTargetPart" AS p WHERE p."socialPostTargetId" = ${socialPostTargetModel.id})`,
        postText: socialPostModel.text,
        provider: socialPostTargetModel.provider,
        publishedAt: socialPostTargetModel.publishedAt,
        publishStartedAt: socialPostTargetModel.publishStartedAt,
        socialPostId: socialPostTargetModel.socialPostId,
        status: socialPostTargetModel.status,
        textOverride: socialPostTargetModel.textOverride,
        workspaceId: socialPostTargetModel.workspaceId,
      })
      .from(socialPostTargetModel)
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
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /**
   * The inboxes of the workspace that read the account a destination publishes
   * to (Facebook: the Page id; Instagram: `igId`; Threads: the user id;
   * TikTok: `openId`).
   */
  async findDestinationInboxes(
    input: {
      externalId: string
      provider: SocialProvider
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<SocialDestinationInbox[]> {
    const { externalId, workspaceId } = input
    switch (input.provider) {
      case "facebook": {
        const rows = await tx
          .select({
            inboxId: integrationMessengerModel.inboxId,
            integrationId: integrationMessengerModel.id,
          })
          .from(integrationMessengerModel)
          .where(
            and(
              eq(integrationMessengerModel.workspaceId, workspaceId),
              eq(integrationMessengerModel.pageId, externalId),
            ),
          )
        return rows.map((row) => ({ ...row, channel: "messenger" }))
      }
      case "instagram": {
        const rows = await tx
          .select({
            inboxId: integrationInstagramModel.inboxId,
            integrationId: integrationInstagramModel.id,
          })
          .from(integrationInstagramModel)
          .where(
            and(
              eq(integrationInstagramModel.workspaceId, workspaceId),
              eq(integrationInstagramModel.igId, externalId),
            ),
          )
        return rows.map((row) => ({ ...row, channel: "instagram" }))
      }
      case "threads": {
        const rows = await tx
          .select({
            inboxId: integrationThreadsModel.inboxId,
            integrationId: integrationThreadsModel.id,
          })
          .from(integrationThreadsModel)
          .where(
            and(
              eq(integrationThreadsModel.workspaceId, workspaceId),
              eq(integrationThreadsModel.threadsUserId, externalId),
            ),
          )
        return rows.map((row) => ({ ...row, channel: "threads" }))
      }
      case "tiktok": {
        const rows = await tx
          .select({
            inboxId: integrationTiktokModel.inboxId,
            integrationId: integrationTiktokModel.id,
          })
          .from(integrationTiktokModel)
          .where(
            and(
              eq(integrationTiktokModel.workspaceId, workspaceId),
              eq(integrationTiktokModel.openId, externalId),
            ),
          )
        return rows.map((row) => ({ ...row, channel: "tiktok" }))
      }
      default: {
        const exhaustive: never = input.provider
        return exhaustive
      }
    }
  },

  /** Links a published target to the `ChannelPost` of the same post; never overwrites a link. */
  async linkChannelPost(
    input: { channelPostId: string; id: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await tx
      .update(socialPostTargetModel)
      .set({ channelPostId: input.channelPostId })
      .where(
        and(
          eq(socialPostTargetModel.id, input.id),
          eq(socialPostTargetModel.workspaceId, input.workspaceId),
          eq(socialPostTargetModel.status, "published"),
          sql`${socialPostTargetModel.channelPostId} IS NULL`,
        ),
      )
      .returning({ id: socialPostTargetModel.id })
    return rows.length > 0
  },
}
