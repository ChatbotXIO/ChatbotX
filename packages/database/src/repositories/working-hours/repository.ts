import {
  and,
  type DatabaseClient,
  db,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  notInArray,
  sql,
} from "../../client"
import {
  WORKING_HOURS_MAX_DATE_OVERRIDES,
  type WorkingHoursDateOverrideInput,
  type WorkingHoursDateRanges,
  type WorkingHoursIntervalInput,
} from "../../partials/working-hours"
import {
  workingHoursDateOverrideModel,
  workingHoursIntervalModel,
  workingHoursMemberModel,
  workingHoursModel,
  workspaceMemberModel,
} from "../../schema"
import type {
  WorkingHoursDateOverrideModel,
  WorkingHoursIntervalModel,
  WorkingHoursMemberModel,
  WorkingHoursModel,
} from "../../types"

export type WorkingHoursWithRelations = WorkingHoursModel & {
  intervals: WorkingHoursIntervalModel[]
  members: WorkingHoursMemberModel[]
}

/**
 * Every write transaction starts here. Bumping `updatedAt` takes the parent
 * row lock, which serializes concurrent saves of one schedule; zero rows means
 * the schedule does not exist in this workspace.
 */
async function lockParent(
  tx: DatabaseClient,
  props: { workspaceId: string; workingHoursId: string },
): Promise<boolean> {
  const rows = await tx
    .update(workingHoursModel)
    .set({ updatedAt: new Date() })
    .where(
      and(
        eq(workingHoursModel.id, props.workingHoursId),
        eq(workingHoursModel.workspaceId, props.workspaceId),
      ),
    )
    .returning({ id: workingHoursModel.id })
  return rows.length > 0
}

/**
 * Bumps `updatedAt` of schedules that lost a member so lists show a fresh
 * "Modified". Rows are locked in ascending id order (deterministic, no
 * lock-order cycle) with `FOR NO KEY UPDATE`: the bump touches a non-key
 * column, so it does not block foreign-key checks. With `skipLocked` a row
 * another transaction holds is left alone instead of waited for, so the caller
 * can never deadlock on it. That is best effort: a skipped row keeps its
 * previous timestamp if the holding transaction rolls back (or does not bump).
 */
async function touchSchedules(
  tx: DatabaseClient,
  props: { workspaceId: string; ids: string[]; skipLocked: boolean },
): Promise<void> {
  const ids = [...new Set(props.ids)].sort()
  if (ids.length === 0) {
    return
  }
  const where = and(
    inArray(workingHoursModel.id, ids),
    eq(workingHoursModel.workspaceId, props.workspaceId),
  )
  const locked = await tx
    .select({ id: workingHoursModel.id })
    .from(workingHoursModel)
    .where(where)
    .orderBy(workingHoursModel.id)
    .for("no key update", props.skipLocked ? { skipLocked: true } : undefined)
  if (locked.length === 0) {
    return
  }
  await tx
    .update(workingHoursModel)
    .set({ updatedAt: new Date() })
    .where(
      and(
        inArray(
          workingHoursModel.id,
          locked.map((row) => row.id),
        ),
        eq(workingHoursModel.workspaceId, props.workspaceId),
      ),
    )
}

/**
 * Serializes every write to one override scope (a schedule's date overrides,
 * or the workspace holidays) so the row limit and full replacement cannot
 * interleave. A schedule scope takes the parent row lock (the same lock the
 * weekly intervals use); the workspace scope has no parent row, so it takes a
 * transaction-level advisory lock. Returns `false` when the schedule does not
 * exist in the workspace.
 */
async function lockDateOverrideScope(
  tx: DatabaseClient,
  props: { workspaceId: string; workingHoursId: string | null },
): Promise<boolean> {
  if (props.workingHoursId) {
    return await lockParent(tx, {
      workspaceId: props.workspaceId,
      workingHoursId: props.workingHoursId,
    })
  }
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('working-hours-holidays:' || ${props.workspaceId}::text, 0))`,
  )
  return true
}

const scopeWhere = (props: {
  workspaceId: string
  workingHoursId: string | null
}) =>
  and(
    eq(workingHoursDateOverrideModel.workspaceId, props.workspaceId),
    props.workingHoursId
      ? eq(workingHoursDateOverrideModel.workingHoursId, props.workingHoursId)
      : isNull(workingHoursDateOverrideModel.workingHoursId),
  )

export type AddDateOverrideResult =
  | { status: "ok"; override: WorkingHoursDateOverrideModel }
  | { status: "notFound" }
  | { status: "duplicate" }
  | { status: "limitReached" }

export type UpdateDateOverrideResult =
  | { status: "ok"; override: WorkingHoursDateOverrideModel }
  | { status: "notFound" }

type WorkingHoursForAgent = {
  id: string
  intervals: Pick<
    WorkingHoursIntervalModel,
    "weekday" | "startMinute" | "endMinute"
  >[]
}

export type ReplaceMembersResult =
  | { status: "ok" }
  | { status: "notFound" }
  /** Nothing was written: these users are not members of the workspace. */
  | { status: "invalidUsers"; userIds: string[] }

export const workingHoursRepository = {
  async listByWorkspace(
    props: { workspaceId: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursWithRelations[]> {
    return await client.query.workingHoursModel.findMany({
      where: { workspaceId: props.workspaceId },
      with: { intervals: true, members: true },
      orderBy: { createdAt: "asc", id: "asc" },
    })
  },

  async findById(
    props: { workspaceId: string; id: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursWithRelations | undefined> {
    return await client.query.workingHoursModel.findFirst({
      where: { id: props.id, workspaceId: props.workspaceId },
      with: { intervals: true, members: true },
    })
  },

  /**
   * The schedule a user is assigned to (one per member per workspace), as the
   * minimal projection the reply path needs: id + intervals, no member list.
   */
  async findForUser(
    props: { workspaceId: string; userId: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursForAgent | undefined> {
    const [member] = await client
      .select({ workingHoursId: workingHoursMemberModel.workingHoursId })
      .from(workingHoursMemberModel)
      .where(
        and(
          eq(workingHoursMemberModel.workspaceId, props.workspaceId),
          eq(workingHoursMemberModel.userId, props.userId),
        ),
      )
      .limit(1)
    if (!member) {
      return
    }
    return await client.query.workingHoursModel.findFirst({
      where: { id: member.workingHoursId, workspaceId: props.workspaceId },
      columns: { id: true },
      with: {
        intervals: {
          columns: { weekday: true, startMinute: true, endMinute: true },
        },
      },
    })
  },

  async create(
    props: { workspaceId: string; name: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursModel> {
    const [row] = await client
      .insert(workingHoursModel)
      .values({ workspaceId: props.workspaceId, name: props.name })
      .returning()
    return row
  },

  async rename(
    props: { workspaceId: string; id: string; name: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursModel | undefined> {
    const [row] = await client
      .update(workingHoursModel)
      .set({ name: props.name })
      .where(
        and(
          eq(workingHoursModel.id, props.id),
          eq(workingHoursModel.workspaceId, props.workspaceId),
        ),
      )
      .returning()
    return row
  },

  async delete(
    props: { workspaceId: string; id: string },
    client: DatabaseClient = db,
  ): Promise<boolean> {
    const rows = await client
      .delete(workingHoursModel)
      .where(
        and(
          eq(workingHoursModel.id, props.id),
          eq(workingHoursModel.workspaceId, props.workspaceId),
        ),
      )
      .returning({ id: workingHoursModel.id })
    return rows.length > 0
  },

  /** Full replacement. Returns `false` when the schedule is not in the workspace. */
  async replaceIntervals(
    props: {
      workspaceId: string
      workingHoursId: string
      intervals: WorkingHoursIntervalInput[]
    },
    client: DatabaseClient = db,
  ): Promise<boolean> {
    return await client.transaction(async (tx) => {
      if (!(await lockParent(tx, props))) {
        return false
      }
      await tx
        .delete(workingHoursIntervalModel)
        .where(
          eq(workingHoursIntervalModel.workingHoursId, props.workingHoursId),
        )
      if (props.intervals.length > 0) {
        await tx.insert(workingHoursIntervalModel).values(
          props.intervals.map((interval) => ({
            workingHoursId: props.workingHoursId,
            weekday: interval.weekday,
            startMinute: interval.startMinute,
            endMinute: interval.endMinute,
          })),
        )
      }
      return true
    })
  },

  /**
   * Full replacement of the schedule's members. A user already on another
   * schedule is moved here by the upsert (one schedule per member per
   * workspace). Membership is verified inside the transaction with a key-share
   * lock on the `WorkspaceMember` rows, so a concurrent member removal either
   * waits for this commit (and then drops the row) or has already happened
   * (and the user is reported as invalid). Nothing is written when any user
   * is not a workspace member.
   */
  async replaceMembers(
    props: { workspaceId: string; workingHoursId: string; userIds: string[] },
    client: DatabaseClient = db,
  ): Promise<ReplaceMembersResult> {
    return await client.transaction(async (tx) => {
      // The one-schedule-per-member upsert can touch rows owned by another
      // schedule, so two saves of different schedules could lock rows in
      // opposite orders. A per-workspace advisory lock serializes every
      // member write in the workspace; it must be the first statement.
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended('working-hours-members:' || ${props.workspaceId}::text, 0))`,
      )
      if (!(await lockParent(tx, props))) {
        return { status: "notFound" }
      }
      // Sorted for a deterministic lock/insert order within one save.
      const userIds = [...new Set(props.userIds)].sort()
      if (userIds.length > 0) {
        const members = await tx
          .select({ userId: workspaceMemberModel.userId })
          .from(workspaceMemberModel)
          .where(
            and(
              eq(workspaceMemberModel.workspaceId, props.workspaceId),
              inArray(workspaceMemberModel.userId, userIds),
            ),
          )
          .orderBy(workspaceMemberModel.userId)
          .for("key share")
        const found = new Set(members.map((member) => member.userId))
        const missing = userIds.filter((userId) => !found.has(userId))
        if (missing.length > 0) {
          return { status: "invalidUsers", userIds: missing }
        }
      }
      // Schedules that lose a user to this one (the upsert below moves them).
      const movedFrom =
        userIds.length > 0
          ? await tx
              .select({ id: workingHoursMemberModel.workingHoursId })
              .from(workingHoursMemberModel)
              .where(
                and(
                  eq(workingHoursMemberModel.workspaceId, props.workspaceId),
                  inArray(workingHoursMemberModel.userId, userIds),
                  ne(
                    workingHoursMemberModel.workingHoursId,
                    props.workingHoursId,
                  ),
                ),
              )
          : []
      // Lock (and bump) the losing parents BEFORE touching any member row. A
      // concurrent delete of one of those schedules cascades to its member
      // rows; locking them after we hold a member row would form a cycle.
      // Lock order: advisory -> this parent -> WorkspaceMember key share ->
      // losing parents (ascending id) -> member rows. A parent deleted in the
      // meantime simply yields no row.
      await touchSchedules(tx, {
        workspaceId: props.workspaceId,
        ids: movedFrom.map((row) => row.id),
        skipLocked: false,
      })
      await tx
        .delete(workingHoursMemberModel)
        .where(
          and(
            eq(workingHoursMemberModel.workingHoursId, props.workingHoursId),
            eq(workingHoursMemberModel.workspaceId, props.workspaceId),
            userIds.length > 0
              ? notInArray(workingHoursMemberModel.userId, userIds)
              : undefined,
          ),
        )
      if (userIds.length > 0) {
        await tx
          .insert(workingHoursMemberModel)
          .values(
            userIds.map((userId) => ({
              workingHoursId: props.workingHoursId,
              workspaceId: props.workspaceId,
              userId,
            })),
          )
          .onConflictDoUpdate({
            target: [
              workingHoursMemberModel.workspaceId,
              workingHoursMemberModel.userId,
            ],
            set: { workingHoursId: props.workingHoursId },
          })
      }
      return { status: "ok" }
    })
  },

  /** Rows of one scope (a schedule, or the workspace holidays when `workingHoursId` is null), by date. */
  async listDateOverrides(
    props: { workspaceId: string; workingHoursId: string | null },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursDateOverrideModel[]> {
    return await client
      .select()
      .from(workingHoursDateOverrideModel)
      .where(scopeWhere(props))
      .orderBy(workingHoursDateOverrideModel.date)
  },

  /** Every schedule's and holiday row inside `[from, to]` — one read for the cached routing window. */
  async listDateOverridesInRange(
    props: { workspaceId: string; from: string; to: string },
    client: DatabaseClient = db,
  ): Promise<WorkingHoursDateOverrideModel[]> {
    return await client
      .select()
      .from(workingHoursDateOverrideModel)
      .where(
        and(
          eq(workingHoursDateOverrideModel.workspaceId, props.workspaceId),
          gte(workingHoursDateOverrideModel.date, props.from),
          lte(workingHoursDateOverrideModel.date, props.to),
        ),
      )
      .orderBy(workingHoursDateOverrideModel.date)
  },

  /** Full replacement of one scope. `notFound` when the schedule is not in the workspace. */
  async replaceDateOverrides(
    props: {
      workspaceId: string
      workingHoursId: string | null
      overrides: WorkingHoursDateOverrideInput[]
    },
    client: DatabaseClient = db,
  ): Promise<{ status: "ok" } | { status: "notFound" }> {
    return await client.transaction(async (tx) => {
      if (!(await lockDateOverrideScope(tx, props))) {
        return { status: "notFound" }
      }
      await tx.delete(workingHoursDateOverrideModel).where(scopeWhere(props))
      if (props.overrides.length > 0) {
        await tx.insert(workingHoursDateOverrideModel).values(
          props.overrides.map((override) => ({
            workspaceId: props.workspaceId,
            workingHoursId: props.workingHoursId,
            date: override.date,
            name: override.name ?? null,
            ranges: override.ranges,
          })),
        )
      }
      return { status: "ok" }
    })
  },

  /** Adds one date to a scope under the scope lock; the 400-row limit is checked inside it. */
  async addDateOverride(
    props: {
      workspaceId: string
      workingHoursId: string | null
      override: WorkingHoursDateOverrideInput
    },
    client: DatabaseClient = db,
  ): Promise<AddDateOverrideResult> {
    return await client.transaction(async (tx) => {
      if (!(await lockDateOverrideScope(tx, props))) {
        return { status: "notFound" }
      }
      const count = await tx.$count(
        workingHoursDateOverrideModel,
        scopeWhere(props),
      )
      if (count >= WORKING_HOURS_MAX_DATE_OVERRIDES) {
        return { status: "limitReached" }
      }
      const [row] = await tx
        .insert(workingHoursDateOverrideModel)
        .values({
          workspaceId: props.workspaceId,
          workingHoursId: props.workingHoursId,
          date: props.override.date,
          name: props.override.name ?? null,
          ranges: props.override.ranges,
        })
        .onConflictDoNothing()
        .returning()
      return row ? { status: "ok", override: row } : { status: "duplicate" }
    })
  },

  /** Changes the name/ranges of a holiday or override; the date is immutable (delete and add to move it). */
  async updateDateOverride(
    props: {
      workspaceId: string
      workingHoursId: string | null
      id: string
      name?: string | null
      ranges?: WorkingHoursDateRanges
    },
    client: DatabaseClient = db,
  ): Promise<UpdateDateOverrideResult> {
    return await client.transaction(async (tx) => {
      if (!(await lockDateOverrideScope(tx, props))) {
        return { status: "notFound" }
      }
      const [row] = await tx
        .update(workingHoursDateOverrideModel)
        .set({
          ...(props.name === undefined ? {} : { name: props.name }),
          ...(props.ranges === undefined ? {} : { ranges: props.ranges }),
          updatedAt: new Date(),
        })
        .where(
          and(
            scopeWhere(props),
            eq(workingHoursDateOverrideModel.id, props.id),
          ),
        )
        .returning()
      return row ? { status: "ok", override: row } : { status: "notFound" }
    })
  },

  async deleteDateOverride(
    props: {
      workspaceId: string
      workingHoursId: string | null
      id: string
    },
    client: DatabaseClient = db,
  ): Promise<boolean> {
    return await client.transaction(async (tx) => {
      if (!(await lockDateOverrideScope(tx, props))) {
        return false
      }
      const rows = await tx
        .delete(workingHoursDateOverrideModel)
        .where(
          and(
            scopeWhere(props),
            eq(workingHoursDateOverrideModel.id, props.id),
          ),
        )
        .returning({ id: workingHoursDateOverrideModel.id })
      return rows.length > 0
    })
  },

  /**
   * Removes users' schedule memberships (member removed from the workspace) and
   * bumps `updatedAt` of the schedules that lost them, best effort. Never waits on
   * a schedule row: the caller may already hold a `WorkspaceMember` row lock, and
   * waiting here could deadlock against `replaceMembers`.
   */
  async deleteMembersForUsers(
    props: { workspaceId: string; userIds: string[] },
    client: DatabaseClient = db,
  ): Promise<void> {
    if (props.userIds.length === 0) {
      return
    }
    await client.transaction(async (tx) => {
      const where = and(
        eq(workingHoursMemberModel.workspaceId, props.workspaceId),
        inArray(workingHoursMemberModel.userId, props.userIds),
      )
      const removed = await tx
        .delete(workingHoursMemberModel)
        .where(where)
        .returning({ id: workingHoursMemberModel.workingHoursId })
      await touchSchedules(tx, {
        workspaceId: props.workspaceId,
        ids: removed.map((row) => row.id),
        skipLocked: true,
      })
    })
  },
}
