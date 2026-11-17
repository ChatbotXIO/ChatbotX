import {
  and,
  type DatabaseClient,
  db,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  or,
  sql,
  sum,
} from "../../client"
import { workspaceMacModel, workspaceModel } from "../../schema"
import { poolWorkspaceScope } from "../workspace/pool-scope"

class WorkspaceMacRepository {
  /**
   * `poolOwnerId`: also include the root-tenant workspaces this owner holds
   * (a reseller owner's platform-host workspaces share their tenant's pool).
   */
  async sumForTenant(
    tenantId: string,
    poolOwnerId?: string,
    client: DatabaseClient = db,
  ): Promise<number> {
    const tenantWorkspaces = client
      .select({ id: workspaceModel.id })
      .from(workspaceModel)
      .where(
        poolOwnerId
          ? poolWorkspaceScope(poolOwnerId, tenantId)
          : eq(workspaceModel.tenantId, tenantId),
      )
    const [row] = await client
      .select({ total: sum(workspaceMacModel.macCount) })
      .from(workspaceMacModel)
      .where(
        and(
          or(
            eq(workspaceMacModel.tenantId, tenantId),
            poolOwnerId
              ? inArray(workspaceMacModel.workspaceId, tenantWorkspaces)
              : undefined,
            poolOwnerId
              ? undefined
              : and(
                  isNull(workspaceMacModel.tenantId),
                  inArray(workspaceMacModel.workspaceId, tenantWorkspaces),
                ),
          ),
          lte(workspaceMacModel.periodStart, sql`now()`),
          gt(workspaceMacModel.periodEnd, sql`now()`),
        ),
      )

    return Number(row?.total ?? 0)
  }

  async sumForOwner(
    input: {
      ownerId: string
      periodStart: Date | null
      cumulative: boolean
    },
    client: DatabaseClient = db,
  ): Promise<number> {
    if (!(input.cumulative || input.periodStart)) {
      return 0
    }

    const ownedWorkspaces = client
      .select({ id: workspaceModel.id })
      .from(workspaceModel)
      .where(eq(workspaceModel.ownerId, input.ownerId))
    const conditions = [
      or(
        eq(workspaceMacModel.ownerId, input.ownerId),
        and(
          isNull(workspaceMacModel.ownerId),
          inArray(workspaceMacModel.workspaceId, ownedWorkspaces),
        ),
      ),
    ]
    if (!input.cumulative && input.periodStart) {
      conditions.push(eq(workspaceMacModel.periodStart, input.periodStart))
    }

    const [row] = await client
      .select({ total: sum(workspaceMacModel.macCount) })
      .from(workspaceMacModel)
      .where(and(...conditions))

    return Number(row?.total ?? 0)
  }
}

export const workspaceMacRepository = new WorkspaceMacRepository()
