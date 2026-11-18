import {
  and,
  asc,
  type DatabaseClient,
  db,
  desc,
  eq,
  ilike,
  isNull,
  notExists,
  or,
  sql,
} from "../../client"
import { inboxModel, userModel, workspaceModel } from "../../schema"
import type { WorkspaceModel } from "../../types"
import { getPaginationWithDefaults, likeContains } from "../../utils"

/** What a workspace deletion request needs from the locked row. */
export type WorkspaceDeletionRequestState = Pick<
  WorkspaceModel,
  | "id"
  | "name"
  | "scheduledDeletionAt"
  | "deletionRequestedAt"
  | "deletionRequestedById"
  | "purgeStartedAt"
>

/** A workspace locked for an owner transfer, with its owner's tenant. */
export type WorkspaceOwnerTransferState = Pick<
  WorkspaceModel,
  | "id"
  | "ownerId"
  | "tenantId"
  | "purgeStartedAt"
  | "scheduledDeletionAt"
  | "name"
> & { ownerTenantId: string }

/** One row of the reseller console's sub-account workspace list. */
export type SubAccountWorkspaceRow = {
  id: string
  name: string
  createdAt: Date
  ownerId: string
  ownerName: string | null
  ownerEmail: string
}

export const workspaceRepository = {
  /**
   * Takes the shared lock that fences child-table writes against a workspace
   * purge, and reports whether writing is still allowed. A purge sets
   * `purgeStartedAt` under an exclusive lock, so a writer holding this
   * `FOR KEY SHARE` through commit can never land a row after the purge drain.
   * Shared by every FK-less child table (ContactInboxPost, ContactActivity,
   * ContactKeywordMessage, ContactState).
   */
  async lockWorkspaceForChildWrite(
    input: { workspaceId: string },
    tx: DatabaseClient,
  ): Promise<boolean> {
    const result = await tx.execute<{ purgeStartedAt: Date | null }>(sql`
      SELECT "purgeStartedAt"
      FROM "Workspace"
      WHERE "id" = ${input.workspaceId}::bigint
      FOR KEY SHARE
    `)

    return result.rows[0]?.purgeStartedAt === null
  },
  /**
   * Serializes first-workspace and connect-target find-or-create per owner for
   * the life of `tx`. The shared lock key deliberately fences both flows.
   * Transaction-scoped, so the lock releases on commit/rollback and also
   * fences a caller-owned transaction a Redis lock could not.
   */
  async lockFirstWorkspace(
    input: { ownerId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    const lockKey = `first-workspace:${input.ownerId}`
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
    )
  },
  /**
   * Locks one workspace row (`FOR NO KEY UPDATE`) and returns its
   * deletion-request state. Callers must pass an open transaction: the lock
   * lasts until it ends, so two concurrent schedule/cancel calls for one
   * workspace serialize on it, and so does the purge fence's `FOR UPDATE`.
   * Deliberately not `FOR UPDATE`: that is the only row lock that conflicts
   * with the `FOR KEY SHARE` every insert into a table with an FK to
   * `Workspace` takes, so it would stall those writes for the whole workspace
   * until commit. `NO KEY UPDATE` is the lock the following non-key `UPDATE`
   * takes anyway.
   */
  async findByIdForUpdate(
    input: { id: string },
    tx: DatabaseClient,
  ): Promise<WorkspaceDeletionRequestState | undefined> {
    const [row] = await tx
      .select({
        id: workspaceModel.id,
        name: workspaceModel.name,
        scheduledDeletionAt: workspaceModel.scheduledDeletionAt,
        deletionRequestedAt: workspaceModel.deletionRequestedAt,
        deletionRequestedById: workspaceModel.deletionRequestedById,
        purgeStartedAt: workspaceModel.purgeStartedAt,
      })
      .from(workspaceModel)
      .where(eq(workspaceModel.id, input.id))
      .for("no key update")
    return row
  },
  /**
   * The live workspace a user already owns — excludes a row mid soft-delete
   * (`scheduledDeletionAt` set) so `ensureFirstForOwner`'s idempotency
   * check never hands back a workspace that's about to be purged, and
   * orders by `id` (time-ordered) so a concurrent caller resolving "the"
   * first workspace agrees deterministically even if the owner somehow
   * ends up with more than one live row.
   */
  async findActiveByOwner(
    input: { ownerId: string; tenantId?: string },
    tx: DatabaseClient = db,
  ): Promise<WorkspaceModel | undefined> {
    return await tx.query.workspaceModel.findFirst({
      where: {
        ownerId: input.ownerId,
        scheduledDeletionAt: { isNull: true },
        ...(input.tenantId === undefined ? {} : { tenantId: input.tenantId }),
      },
      orderBy: { id: "asc" },
    })
  },

  /**
   * The owner's earliest live workspace with no Inbox. Connect starts can
   * safely reuse it after a replay, while a workspace that already has a
   * channel remains an immutable connect target.
   */
  async findEmptyActiveByOwner(
    input: { ownerId: string; tenantId?: string },
    tx: DatabaseClient = db,
  ): Promise<WorkspaceModel | undefined> {
    const workspaces = await tx
      .select()
      .from(workspaceModel)
      .where(
        and(
          eq(workspaceModel.ownerId, input.ownerId),
          isNull(workspaceModel.scheduledDeletionAt),
          input.tenantId === undefined
            ? undefined
            : eq(workspaceModel.tenantId, input.tenantId),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(inboxModel)
              .where(eq(inboxModel.workspaceId, workspaceModel.id)),
          ),
        ),
      )
      .orderBy(asc(workspaceModel.id))
      .limit(1)

    return workspaces[0]
  },

  async listByOwner(
    input: { ownerId: string },
    tx: DatabaseClient = db,
  ): Promise<Array<{ id: string; scheduledDeletionAt: Date | null }>> {
    return await tx
      .select({
        id: workspaceModel.id,
        scheduledDeletionAt: workspaceModel.scheduledDeletionAt,
      })
      .from(workspaceModel)
      .where(eq(workspaceModel.ownerId, input.ownerId))
      .orderBy(asc(workspaceModel.id))
  },

  /**
   * Locks one workspace row (`FOR NO KEY UPDATE`, only the `Workspace` row, not
   * the joined `User`) and returns what an owner transfer must check: the
   * workspace's tenant and purge state plus its owner's tenant. Same lock as
   * `findByIdForUpdate`, so it serializes with the purge fence. Requires an
   * open transaction.
   */
  async lockForOwnerTransfer(
    input: { id: string },
    tx: DatabaseClient,
  ): Promise<WorkspaceOwnerTransferState | undefined> {
    const [row] = await tx
      .select({
        id: workspaceModel.id,
        name: workspaceModel.name,
        ownerId: workspaceModel.ownerId,
        tenantId: workspaceModel.tenantId,
        purgeStartedAt: workspaceModel.purgeStartedAt,
        scheduledDeletionAt: workspaceModel.scheduledDeletionAt,
        ownerTenantId: userModel.tenantId,
      })
      .from(workspaceModel)
      .innerJoin(userModel, eq(workspaceModel.ownerId, userModel.id))
      .where(eq(workspaceModel.id, input.id))
      .for("no key update", { of: workspaceModel })
    return row
  },

  /** Re-points a workspace at a new owner and tenant. Caller holds the row lock. */
  async reassignOwner(
    input: { id: string; ownerId: string; tenantId: string },
    tx: DatabaseClient,
  ): Promise<void> {
    await tx
      .update(workspaceModel)
      .set({ ownerId: input.ownerId, tenantId: input.tenantId })
      .where(eq(workspaceModel.id, input.id))
  },

  /**
   * Workspaces of tenant `tenantId` whose owner is a sub-account of that same
   * tenant (the reseller's own workspaces and stray rows are excluded), newest
   * first, for the reseller console.
   */
  async listByTenantForOwnerConsole(
    input: {
      tenantId: string
      keyword?: string
      page?: number | null
      perPage?: number | null
    },
    tx: DatabaseClient = db,
  ): Promise<{ data: SubAccountWorkspaceRow[]; pageCount: number }> {
    const pagination = getPaginationWithDefaults(input)
    const keywordFilter = input.keyword
      ? or(
          ilike(workspaceModel.name, likeContains(input.keyword)),
          ilike(userModel.email, likeContains(input.keyword)),
          ilike(workspaceModel.id, likeContains(input.keyword)),
        )
      : undefined
    const where = and(
      eq(workspaceModel.tenantId, input.tenantId),
      eq(userModel.tenantId, input.tenantId),
      isNull(workspaceModel.scheduledDeletionAt),
      isNull(workspaceModel.purgeStartedAt),
      keywordFilter,
    )

    const [data, [{ count }]] = await Promise.all([
      tx
        .select({
          id: workspaceModel.id,
          name: workspaceModel.name,
          createdAt: workspaceModel.createdAt,
          ownerId: workspaceModel.ownerId,
          ownerName: userModel.name,
          ownerEmail: userModel.email,
        })
        .from(workspaceModel)
        .innerJoin(userModel, eq(workspaceModel.ownerId, userModel.id))
        .where(where)
        .orderBy(desc(workspaceModel.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
      tx
        .select({ count: sql<number>`count(*)::int` })
        .from(workspaceModel)
        .innerJoin(userModel, eq(workspaceModel.ownerId, userModel.id))
        .where(where),
    ])

    return { data, pageCount: Math.ceil(count / pagination.limit) }
  },
}
