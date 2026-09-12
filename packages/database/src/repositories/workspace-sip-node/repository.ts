import { count, type DatabaseClient, db } from "../../client"
import { workspaceSipNodeModel } from "../../schema"

type WorkspaceSipNodeRow = typeof workspaceSipNodeModel.$inferSelect

class WorkspaceSipNodeRepository {
  async findByWorkspaceId(
    workspaceId: string,
    tx: DatabaseClient = db,
  ): Promise<WorkspaceSipNodeRow | undefined> {
    return await tx.query.workspaceSipNodeModel.findFirst({
      where: { workspaceId },
    })
  }

  /** Pin counts per node — the input to the caller's least-loaded choice. */
  async countByNode(tx: DatabaseClient = db): Promise<Record<string, number>> {
    const rows = await tx
      .select({
        nodeId: workspaceSipNodeModel.nodeId,
        count: count(workspaceSipNodeModel.workspaceId),
      })
      .from(workspaceSipNodeModel)
      .groupBy(workspaceSipNodeModel.nodeId)

    return Object.fromEntries(rows.map((row) => [row.nodeId, row.count]))
  }

  /**
   * Atomically pins a workspace to a node and reads back the result — the
   * `ON CONFLICT (workspaceId) DO NOTHING` covers a lost-lock race for the
   * SAME workspace (two callers picking a node concurrently converge on
   * whichever insert wins); the cross-workspace least-loaded balance
   * itself is only correct when the caller wraps this in
   * `distributedLock.runExclusive` (that serialization lives in
   * `packages/business`, not here — this repository stays pure).
   *
   * `chooseNode` receives the current per-node pin counts (from
   * {@link countByNode}) and must return the node to try pinning to.
   */
  async pinOrGet(
    input: {
      workspaceId: string
      chooseNode: (countsByNode: Record<string, number>) => string
    },
    tx: DatabaseClient = db,
  ): Promise<WorkspaceSipNodeRow> {
    const existing = await this.findByWorkspaceId(input.workspaceId, tx)
    if (existing) {
      return existing
    }

    const counts = await this.countByNode(tx)
    const nodeId = input.chooseNode(counts)

    await tx
      .insert(workspaceSipNodeModel)
      .values({ workspaceId: input.workspaceId, nodeId })
      .onConflictDoNothing({ target: workspaceSipNodeModel.workspaceId })

    const pinned = await this.findByWorkspaceId(input.workspaceId, tx)
    if (!pinned) {
      throw new Error(
        `WorkspaceSipNode pinOrGet failed to read back workspaceId ${input.workspaceId}`,
      )
    }
    return pinned
  }
}

export const workspaceSipNodeRepository = new WorkspaceSipNodeRepository()
