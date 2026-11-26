import { and, eq, or, type SQL } from "../../client"
import { ROOT_TENANT_ID, workspaceModel } from "../../schema"

/**
 * A reseller owner's pooled workspaces: everything in their tenant, plus the
 * root-tenant workspaces they own (created on the platform host). One
 * `UserQuota` row covers both, so reconcile must count both.
 */
export function poolWorkspaceScope(ownerId: string, tenantId: string): SQL {
  return or(
    eq(workspaceModel.tenantId, tenantId),
    and(
      eq(workspaceModel.tenantId, ROOT_TENANT_ID),
      eq(workspaceModel.ownerId, ownerId),
    ),
  ) as SQL
}
