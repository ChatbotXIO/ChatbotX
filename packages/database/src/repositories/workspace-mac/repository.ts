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

class WorkspaceMacRepository {
  async sumBillingMacForTenant(
    tenantId: string,
    client: DatabaseClient = db,
  ): Promise<number> {
    const tenantWorkspaces = client
      .select({ id: workspaceModel.id })
      .from(workspaceModel)
      .where(eq(workspaceModel.tenantId, tenantId))
    const [row] = await client
      .select({ total: sum(workspaceMacModel.macCount) })
      .from(workspaceMacModel)
      .where(
        and(
          or(
            eq(workspaceMacModel.tenantId, tenantId),
            and(
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
}

export const workspaceMacRepository = new WorkspaceMacRepository()
