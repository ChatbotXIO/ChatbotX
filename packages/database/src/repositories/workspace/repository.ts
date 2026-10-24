import { type DatabaseClient, sql } from "../../client"

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
}
