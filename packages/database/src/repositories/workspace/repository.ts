import { type DatabaseClient, db, sql } from "../../client"
import type { WorkspaceModel } from "../../types"

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
   * Serializes "find or create the owner's first workspace" per owner for the
   * life of `tx`. Transaction-scoped, so the lock releases on commit/rollback
   * and also fences a caller-owned transaction a Redis lock could not.
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
   * The live workspace a user already owns — excludes a row mid soft-delete
   * (`scheduledDeletionAt` set) so `ensureFirstForOwner`'s idempotency
   * check never hands back a workspace that's about to be purged, and
   * orders by `id` (time-ordered) so a concurrent caller resolving "the"
   * first workspace agrees deterministically even if the owner somehow
   * ends up with more than one live row.
   */
  async findActiveByOwner(
    input: { ownerId: string },
    tx: DatabaseClient = db,
  ): Promise<WorkspaceModel | undefined> {
    return await tx.query.workspaceModel.findFirst({
      where: { ownerId: input.ownerId, scheduledDeletionAt: { isNull: true } },
      orderBy: { id: "asc" },
    })
  },
}
