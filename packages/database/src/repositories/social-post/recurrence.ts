import type { RecurrenceRule } from "@chatbotx.io/utils/recurrence"
import { and, asc, desc, eq, inArray, like, sql } from "drizzle-orm"
import { type DatabaseClient, db } from "../../client"
import type { SocialPostRecurrenceOutcome } from "../../partials/social-post"
import {
  socialPostModel,
  socialPostRecurrenceModel,
  socialPostRecurrenceOccurrenceModel,
} from "../../schema"
import type {
  SocialPostRecurrenceModel,
  SocialPostRecurrenceOccurrenceModel,
} from "../../types"

/** A series whose next slot has come due, as the per-minute scan returns it. */
export type DueSocialPostRecurrence = {
  id: string
  nextRunAt: Date
  socialPostId: string
  workspaceId: string
}

export type SocialPostLedgerRowInput = {
  localSlot: string
  occurrenceAt: Date
  outcome: SocialPostRecurrenceOutcome
  recurrenceId: string
  socialPostId: string | null
  workspaceId: string
}

export type SocialPostRecurrencePatch = Partial<
  Pick<
    SocialPostRecurrenceModel,
    | "accountedThroughAt"
    | "endedAt"
    | "nextRunAt"
    | "occurrenceCount"
    | "pausedAt"
    | "rule"
  >
>

export type SocialPostLedgerCursor = { id: string; occurrenceAt: Date }

const r = socialPostRecurrenceModel
const o = socialPostRecurrenceOccurrenceModel

export const socialPostRecurrenceRepository = {
  /** The database clock: every due cutoff uses it, never a worker's. */
  async selectDbNow(tx: DatabaseClient = db): Promise<Date> {
    const result = await tx.execute<{ now: Date }>(sql`SELECT now() AS "now"`)
    const [row] = result.rows
    return new Date(row?.now ?? Date.now())
  },

  /**
   * Running series whose slot is due, oldest first; the cutoff is evaluated in
   * SQL. `after` is a keyset cursor (the last row of the previous page), so a
   * caller can walk past rows it chose to leave untouched.
   */
  async listDue(
    input: {
      after?: { id: string; nextRunAt: Date } | null
      limit: number
    },
    tx: DatabaseClient = db,
  ): Promise<DueSocialPostRecurrence[]> {
    const rows = await tx
      .select({
        id: r.id,
        nextRunAt: r.nextRunAt,
        socialPostId: r.socialPostId,
        workspaceId: r.workspaceId,
      })
      .from(r)
      .where(
        and(
          sql`${r.endedAt} IS NULL`,
          sql`${r.pausedAt} IS NULL`,
          sql`${r.nextRunAt} <= now()`,
          input.after
            ? sql`(${r.nextRunAt}, ${r.id}) > (${input.after.nextRunAt.toISOString()}::timestamptz, ${input.after.id})`
            : undefined,
        ),
      )
      .orderBy(asc(r.nextRunAt), asc(r.id))
      .limit(input.limit)
    // The `nextRunAt <= now()` filter excludes null: the guard only narrows the type.
    return rows.flatMap(({ nextRunAt, ...row }) =>
      nextRunAt ? [{ ...row, nextRunAt }] : [],
    )
  },

  /** The series of a template, unlocked. */
  async findByPost(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPostRecurrenceModel | null> {
    const [row] = await tx
      .select()
      .from(r)
      .where(
        and(
          eq(r.socialPostId, input.socialPostId),
          eq(r.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  /** The series of each post, for a page of posts. */
  async listByPosts(
    input: { postIds: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<SocialPostRecurrenceModel[]> {
    if (input.postIds.length === 0) {
      return []
    }
    return await tx
      .select()
      .from(r)
      .where(
        and(
          inArray(r.socialPostId, [...input.postIds]),
          eq(r.workspaceId, input.workspaceId),
        ),
      )
  },

  /** The series, locked. Taken AFTER the template post row, never before. */
  async lockByPost(
    input: { socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<SocialPostRecurrenceModel | null> {
    const [row] = await tx
      .select()
      .from(r)
      .where(
        and(
          eq(r.socialPostId, input.socialPostId),
          eq(r.workspaceId, input.workspaceId),
        ),
      )
      .limit(1)
      .for("update")
    return row ?? null
  },

  /** Creates the series row for a template if it has none; an existing row is left as it is. */
  async insertIfMissing(
    input: { rule: RecurrenceRule; socialPostId: string; workspaceId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx.insert(r).values(input).onConflictDoNothing({
      target: r.socialPostId,
    })
  },

  /** `expectedNextRunAt` makes the write a compare-and-set on the slot being handled. */
  async update(
    input: {
      expectedNextRunAt?: Date | null
      id: string
      patch: SocialPostRecurrencePatch
    },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const rows = await tx
      .update(r)
      .set(input.patch)
      .where(
        and(
          eq(r.id, input.id),
          input.expectedNextRunAt
            ? eq(r.nextRunAt, input.expectedNextRunAt)
            : undefined,
        ),
      )
      .returning({ id: r.id })
    return rows.length > 0
  },

  // ---- ledger ---------------------------------------------------------------

  /**
   * Writes the slot's row; `null` means the slot already has one (a replay),
   * so the caller must not create anything for it again.
   */
  async insertLedgerRow(
    input: SocialPostLedgerRowInput,
    tx: DatabaseClient,
  ): Promise<{ id: string } | null> {
    const [row] = await tx
      .insert(o)
      .values(input)
      .onConflictDoNothing({
        target: [o.recurrenceId, o.localSlot, o.occurrenceAt],
      })
      .returning({ id: o.id })
    return row ?? null
  },

  async updateLedgerRow(
    input: {
      id: string
      outcome: SocialPostRecurrenceOutcome
      socialPostId: string | null
    },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(o)
      .set({ outcome: input.outcome, socialPostId: input.socialPostId })
      .where(eq(o.id, input.id))
  },

  /** Ledger rows whose slot falls on a local date: a date with one is settled. */
  async listLedgerForDates(
    input: { dates: readonly string[]; recurrenceId: string },
    tx: DatabaseClient,
  ): Promise<Pick<SocialPostRecurrenceOccurrenceModel, "localSlot">[]> {
    if (input.dates.length === 0) {
      return []
    }
    const rows: Pick<SocialPostRecurrenceOccurrenceModel, "localSlot">[] = []
    for (const date of input.dates) {
      rows.push(
        ...(await tx
          .select({ localSlot: o.localSlot })
          .from(o)
          .where(
            and(
              eq(o.recurrenceId, input.recurrenceId),
              like(o.localSlot, `${date} %`),
            ),
          )
          .limit(1)),
      )
    }
    return rows
  },

  /** Newest first, keyset on `(occurrenceAt, id)`. */
  async listLedger(
    input: {
      cursor?: SocialPostLedgerCursor | null
      limit: number
      recurrenceId: string
      workspaceId: string
    },
    tx: DatabaseClient = db,
  ): Promise<SocialPostRecurrenceOccurrenceModel[]> {
    return await tx
      .select()
      .from(o)
      .where(
        and(
          eq(o.recurrenceId, input.recurrenceId),
          eq(o.workspaceId, input.workspaceId),
          input.cursor
            ? sql`(${o.occurrenceAt}, ${o.id}) < (${input.cursor.occurrenceAt.toISOString()}::timestamptz, ${input.cursor.id})`
            : undefined,
        ),
      )
      .orderBy(desc(o.occurrenceAt), desc(o.id))
      .limit(input.limit)
  },

  /** Statuses of the occurrence posts, to show beside their ledger rows. */
  async listPostStatuses(
    input: { ids: readonly string[]; workspaceId: string },
    tx: DatabaseClient = db,
  ): Promise<{ id: string; status: string }[]> {
    if (input.ids.length === 0) {
      return []
    }
    return await tx
      .select({ id: socialPostModel.id, status: socialPostModel.status })
      .from(socialPostModel)
      .where(
        and(
          inArray(socialPostModel.id, [...input.ids]),
          eq(socialPostModel.workspaceId, input.workspaceId),
        ),
      )
  },
}
