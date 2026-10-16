import { type DatabaseClient, db, sql } from "../../client"
import type {
  LeaderboardScoreSource,
  LeaderboardStatus,
} from "../../partials/leaderboard"
import { likeContains } from "../../utils"

/** Thrown inside a transaction to roll back the event row when the score UPSERT is rejected. */
export class LeaderboardChangeRejected extends Error {
  constructor() {
    super("Leaderboard score change rejected")
    this.name = "LeaderboardChangeRejected"
  }
}

export type LeaderboardScoreChangeInput = {
  leaderboardId: string
  workspaceId: string
  contactId: string
  delta: number
  source: LeaderboardScoreSource
  /** Rule key for rule awards; also the `breakdown` counter that is bumped. */
  rule?: string | null
  /** `breakdown` key to bump when there is no rule (e.g. "flow", "manual"). */
  breakdownKey?: string | null
  /** +1 for an award, -1 for a reversal (unfollow / left group). */
  breakdownStep?: 1 | -1
  sourceRef?: string | null
  /** Event primary key. Deterministic for automatic events so retries collide. */
  eventId: string
  eventAt: Date
  /** Daily cap enforcement; omit for flow/manual/reversal changes. */
  limits?: {
    dayBucket: string
    maxPerDay: number | null
    cooldownSeconds: number
  } | null
  /** Stamped only when the participant row is created. */
  referrerContactId?: string | null
  /** Upper bound for the score (Redis precision limit). */
  maxScore: number
  /**
   * Leaderboard statuses this change may be written in, checked under a
   * `FOR SHARE` lock on the Leaderboard row so a finish/pause racing the
   * write is either seen or waits for it. A finished leaderboard never takes
   * a change once rewards were triggered.
   */
  allowedStatuses: readonly LeaderboardStatus[]
  /**
   * For events with no stable source time (flow steps): `eventAt` is "now",
   * so the primary key cannot catch a retry. When set, an event with the same
   * id for this contact since this time counts as a duplicate.
   */
  dedupSince?: Date | null
}

export type LeaderboardScoreChangeResult =
  | { status: "duplicate" }
  | { status: "rejected" }
  /** The leaderboard is not in an allowed status (or rewards were already sent). */
  | { status: "closed" }
  | {
      status: "applied"
      score: number
      scoredAt: Date
      isNew: boolean
      /** Status observed under the lock — decides whether Redis is live. */
      leaderboardStatus: LeaderboardStatus
    }

export type LeaderboardRankedRow = {
  contactId: string
  score: number
  scoredAt: Date
}

/** A ranking row plus its exact `scoredAt` (microseconds) for keyset paging. */
export type LeaderboardRankingPageRow = LeaderboardRankedRow & {
  cursor: string
}

export type LeaderboardChangedRow = LeaderboardRankedRow & {
  isBanned: boolean
}

export type LeaderboardParticipantListInput = {
  leaderboardId: string
  workspaceId: string
  keyword?: string | null
  bannedOnly?: boolean
  contactIds?: string[] | null
  page: number
  perPage: number
}

const MAX_PER_PAGE = 100
const CONTACT_ID_PATTERN = /^\d{1,19}$/

export const leaderboardParticipantRepository = {
  /**
   * Applies one score change. MUST run inside a transaction: the event row is
   * written first (ON CONFLICT on the deterministic primary key detects a
   * redelivery), then the participant UPSERT both adds the points and checks
   * ban/daily-cap/cooldown in its WHERE. A rejected UPSERT throws
   * `LeaderboardChangeRejected` so the caller's transaction rolls the event
   * row back. Callers use `applyScoreChange` from the service, which wraps
   * this in a transaction and maps the error to `{ status: "rejected" }`.
   */
  async applyChangeInTransaction(
    input: LeaderboardScoreChangeInput,
    tx: DatabaseClient,
  ): Promise<LeaderboardScoreChangeResult> {
    const guard = await tx.execute<{ status: LeaderboardStatus }>(sql`
      SELECT "status" FROM "Leaderboard"
      WHERE "id" = ${input.leaderboardId}::bigint
        AND "workspaceId" = ${input.workspaceId}::bigint
        AND "deletedAt" IS NULL
        AND "status"::text IN (${sql.join(
          input.allowedStatuses.map((status) => sql`${status}`),
          sql`, `,
        )})
        AND ("status" <> 'finished' OR "rewardsTriggeredAt" IS NULL)
      FOR SHARE
    `)
    const leaderboardStatus = guard.rows[0]?.status
    if (!leaderboardStatus) {
      return { status: "closed" }
    }

    if (input.dedupSince) {
      // Serializes concurrent attempts of the same event before the lookup.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(${input.eventId}::bigint)`,
      )
      const existing = await tx.execute(sql`
        SELECT 1 FROM "LeaderboardScoreEvent"
        WHERE "leaderboardId" = ${input.leaderboardId}::bigint
          AND "contactId" = ${input.contactId}::bigint
          AND "createdAt" >= ${input.dedupSince}::timestamptz
          AND "id" = ${input.eventId}::bigint
        LIMIT 1
      `)
      if ((existing.rowCount ?? 0) > 0) {
        return { status: "duplicate" }
      }
    }

    const inserted = await tx.execute(sql`
      INSERT INTO "LeaderboardScoreEvent"
        ("id", "createdAt", "leaderboardId", "workspaceId", "contactId",
         "delta", "source", "rule", "sourceRef")
      VALUES (
        ${input.eventId}::bigint, ${input.eventAt}::timestamptz,
        ${input.leaderboardId}::bigint, ${input.workspaceId}::bigint,
        ${input.contactId}::bigint, ${input.delta}::int,
        ${input.source}::"leaderboardScoreSource", ${input.rule ?? null},
        ${input.sourceRef ?? null}
      )
      ON CONFLICT ("createdAt", "id") DO NOTHING
      RETURNING 1
    `)
    if ((inserted.rowCount ?? 0) === 0) {
      return { status: "duplicate" }
    }

    const counterKey = input.rule ?? input.breakdownKey ?? null
    const step = input.breakdownStep ?? 1
    const limits = input.limits ?? null
    const dayBucket = limits?.dayBucket ?? null
    const ruleForDaily = limits ? (input.rule ?? null) : null

    const insertBreakdown = counterKey
      ? sql`jsonb_build_object(${counterKey}::text, GREATEST(0, ${step}::int))`
      : sql`'{}'::jsonb`
    const insertDaily =
      ruleForDaily && step > 0
        ? sql`jsonb_build_object(${ruleForDaily}::text, 1)`
        : sql`'{}'::jsonb`

    const updateBreakdown = counterKey
      ? sql`p."breakdown" || jsonb_build_object(${counterKey}::text,
          GREATEST(0, COALESCE((p."breakdown" ->> ${counterKey}::text)::int, 0) + ${step}::int))`
      : sql`p."breakdown"`

    const updateDaily =
      ruleForDaily && step > 0
        ? sql`CASE WHEN p."dailyBucket" = ${dayBucket}::date
            THEN p."dailyCounts" || jsonb_build_object(${ruleForDaily}::text,
              COALESCE((p."dailyCounts" ->> ${ruleForDaily}::text)::int, 0) + 1)
            ELSE jsonb_build_object(${ruleForDaily}::text, 1) END`
        : sql`p."dailyCounts"`

    const capCondition =
      limits && ruleForDaily && limits.maxPerDay !== null && step > 0
        ? sql`AND (p."dailyBucket" IS DISTINCT FROM ${dayBucket}::date
               OR COALESCE((p."dailyCounts" ->> ${ruleForDaily}::text)::int, 0) < ${limits.maxPerDay}::int)`
        : sql``
    const cooldownCondition =
      limits && limits.cooldownSeconds > 0
        ? sql`AND p."scoredAt" <= now() - make_interval(secs => ${limits.cooldownSeconds}::int)`
        : sql``
    const bucketUpdate =
      limits && ruleForDaily && step > 0
        ? sql`, "dailyBucket" = ${dayBucket}::date`
        : sql``

    const result = await tx.execute<{
      score: number
      scoredAt: Date
      isNew: boolean
    }>(sql`
      INSERT INTO "LeaderboardParticipant" AS p
        ("leaderboardId", "contactId", "workspaceId", "score",
         "referrerContactId", "scoredAt", "dailyBucket", "dailyCounts",
         "breakdown", "lastActivityAt", "createdAt")
      VALUES (
        ${input.leaderboardId}::bigint, ${input.contactId}::bigint,
        ${input.workspaceId}::bigint,
        LEAST(${input.maxScore}::int, GREATEST(0, ${input.delta}::int)),
        ${input.referrerContactId ?? null}::bigint, now(),
        ${ruleForDaily && step > 0 ? dayBucket : null}::date,
        ${insertDaily}, ${insertBreakdown}, now(), now()
      )
      ON CONFLICT ("leaderboardId", "contactId") DO UPDATE SET
        "score" = LEAST(${input.maxScore}::int, GREATEST(0, p."score" + ${input.delta}::int)),
        "dailyCounts" = ${updateDaily},
        "breakdown" = ${updateBreakdown},
        "scoredAt" = CASE WHEN ${input.delta}::int <> 0 THEN now() ELSE p."scoredAt" END,
        "lastActivityAt" = now()
        ${bucketUpdate}
      WHERE NOT p."isBanned"
        ${capCondition}
        ${cooldownCondition}
      RETURNING p."score", p."scoredAt", (xmax = 0) AS "isNew"
    `)

    const row = result.rows[0]
    if (!row) {
      throw new LeaderboardChangeRejected()
    }
    return {
      status: "applied",
      score: Number(row.score),
      scoredAt: new Date(row.scoredAt),
      isNew: Boolean(row.isNew),
      leaderboardStatus,
    }
  },

  async find(
    input: { leaderboardId: string; contactId: string },
    tx: DatabaseClient = db,
  ) {
    return await tx.query.leaderboardParticipantModel.findFirst({
      where: { leaderboardId: input.leaderboardId, contactId: input.contactId },
    })
  },

  /** Locks the participant row; used by admin edits that read before writing. */
  async lock(
    input: { leaderboardId: string; contactId: string },
    tx: DatabaseClient,
  ) {
    const result = await tx.execute<{
      score: number
      isBanned: boolean
    }>(sql`
      SELECT "score", "isBanned"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
        AND "contactId" = ${input.contactId}::bigint
      FOR UPDATE
    `)
    return result.rows[0] ?? null
  },

  async setBanned(
    input: { leaderboardId: string; contactId: string; isBanned: boolean },
    tx: DatabaseClient = db,
  ) {
    const result = await tx.execute<LeaderboardRankedRow>(sql`
      UPDATE "LeaderboardParticipant"
      SET "isBanned" = ${input.isBanned}
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
        AND "contactId" = ${input.contactId}::bigint
      RETURNING "contactId"::text AS "contactId", "score", "scoredAt"
    `)
    const row = result.rows[0]
    return row ? normalizeRankedRow(row) : null
  },

  /** Sets every score of a leaderboard to 0 (admin "reset points"). */
  async resetAll(leaderboardId: string, tx: DatabaseClient = db) {
    const result = await tx.execute(sql`
      UPDATE "LeaderboardParticipant"
      SET "score" = 0, "scoredAt" = now(), "breakdown" = '{}'::jsonb,
          "dailyCounts" = '{}'::jsonb, "dailyBucket" = NULL
      WHERE "leaderboardId" = ${leaderboardId}::bigint
    `)
    return result.rowCount ?? 0
  },

  /** Top of the leaderboard straight from Postgres (fallback when Redis is unavailable, finished boards, rewards). */
  async topRanked(
    input: { leaderboardId: string; limit: number; offset?: number },
    tx: DatabaseClient = db,
  ): Promise<LeaderboardRankedRow[]> {
    const result = await tx.execute<LeaderboardRankedRow>(sql`
      SELECT "contactId"::text AS "contactId", "score", "scoredAt"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint AND NOT "isBanned"
      ORDER BY "score" DESC, "scoredAt" ASC,
        -- Qualified: a bare "contactId" sorts the text output alias.
        "LeaderboardParticipant"."contactId" ASC
      LIMIT ${input.limit}::int OFFSET ${input.offset ?? 0}::int
    `)
    return result.rows.map(normalizeRankedRow)
  },

  /**
   * 1-based rank of one participant without a window function: counts the
   * rows ahead of it on the ranking index. Returns null when the contact is
   * not ranked (absent or banned).
   */
  async rankOf(
    input: { leaderboardId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<{ rank: number; score: number } | null> {
    const result = await tx.execute<{ rank: number; score: number }>(sql`
      SELECT
        (SELECT count(*)::int + 1
         FROM "LeaderboardParticipant" o
         WHERE o."leaderboardId" = me."leaderboardId" AND NOT o."isBanned"
           AND (o."score" > me."score"
             OR (o."score" = me."score" AND o."scoredAt" < me."scoredAt"))
        ) AS "rank",
        me."score"
      FROM "LeaderboardParticipant" me
      WHERE me."leaderboardId" = ${input.leaderboardId}::bigint
        AND me."contactId" = ${input.contactId}::bigint
        AND NOT me."isBanned"
    `)
    const row = result.rows[0]
    return row ? { rank: Number(row.rank), score: Number(row.score) } : null
  },

  /**
   * Keyset page of the ranking for rebuilding the Redis sorted set. Pass the
   * last row of the previous page as `after`. The cursor carries `scoredAt`
   * as text: the column keeps microseconds and a JS Date only milliseconds,
   * so a Date cursor would sit before the last row and — when a whole page
   * shares one timestamp, as after "reset points" — return it forever.
   */
  async rankingPage(
    input: {
      leaderboardId: string
      limit: number
      after?: LeaderboardRankingPageRow | null
    },
    tx: DatabaseClient = db,
  ): Promise<LeaderboardRankingPageRow[]> {
    const after = input.after
    const cursor = after
      ? sql`AND ("score" < ${after.score}::int
          OR ("score" = ${after.score}::int AND "scoredAt" > ${after.cursor}::timestamptz)
          OR ("score" = ${after.score}::int AND "scoredAt" = ${after.cursor}::timestamptz
              AND "contactId" > ${after.contactId}::bigint))`
      : sql``
    const result = await tx.execute<LeaderboardRankingPageRow>(sql`
      SELECT "contactId"::text AS "contactId", "score", "scoredAt",
             "scoredAt"::text AS "cursor"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint AND NOT "isBanned"
        ${cursor}
      ORDER BY "score" DESC, "scoredAt" ASC,
        -- Qualified: a bare "contactId" sorts the text output alias.
        "LeaderboardParticipant"."contactId" ASC
      LIMIT ${input.limit}::int
    `)
    return result.rows.map((row) => ({
      ...normalizeRankedRow(row),
      cursor: String(row.cursor),
    }))
  },

  /**
   * Locks and returns every participant changed since `since` — the rows a
   * Redis rebuild may have snapshotted before a concurrent write. Locking
   * waits for in-flight writes to commit and holds later ones back until the
   * caller's transaction ends, so the values written to Redis are final.
   */
  async lockChangedSince(
    input: { leaderboardId: string; since: Date },
    tx: DatabaseClient,
  ): Promise<LeaderboardChangedRow[]> {
    const result = await tx.execute<LeaderboardChangedRow>(sql`
      SELECT "contactId"::text AS "contactId", "score", "scoredAt", "isBanned"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
        AND "lastActivityAt" >= ${input.since}::timestamptz
      ORDER BY "LeaderboardParticipant"."contactId"
      FOR UPDATE
    `)
    return result.rows.map((row) => ({
      ...normalizeRankedRow(row),
      isBanned: Boolean(row.isBanned),
    }))
  },

  /** Participant count, total points and today's new participants — the `stats` hash rebuild. */
  async stats(
    input: { leaderboardId: string; newSince: Date },
    tx: DatabaseClient = db,
  ): Promise<{ participants: number; totalPoints: number; newToday: number }> {
    const result = await tx.execute<{
      participants: number
      totalPoints: number
      newToday: number
    }>(sql`
      SELECT count(*)::int AS "participants",
             COALESCE(sum("score"), 0)::bigint AS "totalPoints",
             count(*) FILTER (WHERE "createdAt" >= ${input.newSince}::timestamptz)::int AS "newToday"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
    `)
    const row = result.rows[0]
    return {
      participants: Number(row?.participants ?? 0),
      totalPoints: Number(row?.totalPoints ?? 0),
      newToday: Number(row?.newToday ?? 0),
    }
  },

  /** Admin participants table: search by name / phone / contact id, newest-ranked first. */
  async listPaginated(
    input: LeaderboardParticipantListInput,
    tx: DatabaseClient = db,
  ) {
    const where = buildListWhere(input)
    const perPage = Math.min(MAX_PER_PAGE, Math.max(1, input.perPage))
    const offset = (Math.max(1, input.page) - 1) * perPage
    const rows = await tx.execute<{
      contactId: string
      score: number
      isBanned: boolean
      scoredAt: Date
      breakdown: Record<string, number>
      lastActivityAt: Date
      createdAt: Date
      referrerContactId: string | null
      fullName: string | null
      avatar: string | null
      phoneNumber: string | null
    }>(sql`
      SELECT p."contactId"::text AS "contactId", p."score", p."isBanned",
             p."scoredAt", p."breakdown", p."lastActivityAt", p."createdAt",
             p."referrerContactId"::text AS "referrerContactId",
             c."fullName", c."avatar", c."phoneNumber"
      FROM "LeaderboardParticipant" p
      JOIN "Contact" c ON c."id" = p."contactId" AND c."workspaceId" = p."workspaceId"
      WHERE ${where}
      ORDER BY p."isBanned" ASC, p."score" DESC, p."scoredAt" ASC, p."contactId" ASC
      LIMIT ${perPage}::int OFFSET ${offset}::int
    `)
    const total = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS "total"
      FROM "LeaderboardParticipant" p
      JOIN "Contact" c ON c."id" = p."contactId" AND c."workspaceId" = p."workspaceId"
      WHERE ${where}
    `)
    return {
      rows: rows.rows.map((row) => ({
        ...row,
        score: Number(row.score),
        scoredAt: new Date(row.scoredAt),
        lastActivityAt: new Date(row.lastActivityAt),
        createdAt: new Date(row.createdAt),
      })),
      total: Number(total.rows[0]?.total ?? 0),
    }
  },

  /** Name/avatar for a set of ranked contacts (public view Top N, admin Top 10/50). */
  async findContactProfiles(
    input: { workspaceId: string; contactIds: string[] },
    tx: DatabaseClient = db,
  ) {
    if (input.contactIds.length === 0) {
      return []
    }
    return await tx.query.contactModel.findMany({
      where: { workspaceId: input.workspaceId, id: { in: input.contactIds } },
      columns: { id: true, fullName: true, avatar: true },
    })
  },

  /** Tag filter: whether the contact carries at least one of `tagIds`. */
  async contactHasAnyTag(
    input: { contactId: string; tagIds: string[] },
    tx: DatabaseClient = db,
  ): Promise<boolean> {
    if (input.tagIds.length === 0) {
      return true
    }
    const result = await tx.execute(sql`
      SELECT 1 FROM "ContactToTag"
      WHERE "contactId" = ${input.contactId}::bigint
        AND "tagId" = ANY(ARRAY[${sql.join(
          input.tagIds.map((id) => sql`${id}::bigint`),
          sql`, `,
        )}])
      LIMIT 1
    `)
    return (result.rowCount ?? 0) > 0
  },

  /** Keyset page for the CSV export, ranking order, banned rows last. */
  async exportPage(
    input: {
      leaderboardId: string
      limit: number
      offset: number
    },
    tx: DatabaseClient = db,
  ) {
    const result = await tx.execute<{
      contactId: string
      score: number
      isBanned: boolean
      breakdown: Record<string, number>
      lastActivityAt: Date
      createdAt: Date
      fullName: string | null
      phoneNumber: string | null
      email: string | null
    }>(sql`
      SELECT p."contactId"::text AS "contactId", p."score", p."isBanned",
             p."breakdown", p."lastActivityAt", p."createdAt",
             c."fullName", c."phoneNumber", c."email"
      FROM "LeaderboardParticipant" p
      JOIN "Contact" c ON c."id" = p."contactId" AND c."workspaceId" = p."workspaceId"
      WHERE p."leaderboardId" = ${input.leaderboardId}::bigint
      ORDER BY p."isBanned" ASC, p."score" DESC, p."scoredAt" ASC, p."contactId" ASC
      LIMIT ${input.limit}::int OFFSET ${input.offset}::int
    `)
    return result.rows
  },

  /** Name of whoever most recently referred this contact into a leaderboard (`{{referral_name}}`). */
  async findLatestReferrerName(
    input: { workspaceId: string; contactId: string },
    tx: DatabaseClient = db,
  ): Promise<string | null> {
    const result = await tx.execute<{ fullName: string | null }>(sql`
      SELECT c."fullName"
      FROM "LeaderboardParticipant" p
      JOIN "Contact" c ON c."id" = p."referrerContactId" AND c."workspaceId" = p."workspaceId"
      WHERE p."contactId" = ${input.contactId}::bigint
        AND p."workspaceId" = ${input.workspaceId}::bigint
        AND p."referrerContactId" IS NOT NULL
      ORDER BY p."createdAt" DESC
      LIMIT 1
    `)
    return result.rows[0]?.fullName ?? null
  },

  /** Referral guard: whether this contact was already referred into the leaderboard. */
  async countReferredBy(
    input: { leaderboardId: string; referrerContactId: string },
    tx: DatabaseClient = db,
  ): Promise<number> {
    const result = await tx.execute<{ total: number }>(sql`
      SELECT count(*)::int AS "total"
      FROM "LeaderboardParticipant"
      WHERE "leaderboardId" = ${input.leaderboardId}::bigint
        AND "referrerContactId" = ${input.referrerContactId}::bigint
    `)
    return Number(result.rows[0]?.total ?? 0)
  },
}

const buildListWhere = (input: LeaderboardParticipantListInput) => {
  const conditions = [
    sql`p."leaderboardId" = ${input.leaderboardId}::bigint`,
    sql`p."workspaceId" = ${input.workspaceId}::bigint`,
  ]
  if (input.bannedOnly) {
    conditions.push(sql`p."isBanned"`)
  }
  if (input.contactIds) {
    conditions.push(
      input.contactIds.length > 0
        ? sql`p."contactId" = ANY(ARRAY[${sql.join(
            input.contactIds.map((id) => sql`${id}::bigint`),
            sql`, `,
          )}])`
        : sql`false`,
    )
  }
  const keyword = input.keyword?.trim()
  if (keyword) {
    const pattern = likeContains(keyword)
    const idMatch = CONTACT_ID_PATTERN.test(keyword)
      ? sql` OR p."contactId" = ${keyword}::bigint`
      : sql``
    conditions.push(
      sql`(c."fullName" ILIKE ${pattern} OR c."phoneNumber" ILIKE ${pattern}${idMatch})`,
    )
  }
  return sql.join(conditions, sql` AND `)
}

const normalizeRankedRow = (
  row: LeaderboardRankedRow,
): LeaderboardRankedRow => ({
  contactId: String(row.contactId),
  score: Number(row.score),
  scoredAt: new Date(row.scoredAt),
})
