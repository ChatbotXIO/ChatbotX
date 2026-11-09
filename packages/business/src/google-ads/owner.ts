import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { tenantService } from "../enterprise/tenant/service"
import { notFoundException } from "../errors"
import { workspaceService } from "../workspace/service"

/**
 * The `User.id` whose platform credentials apply to a workspace: its tenant's
 * owner when it belongs to a reseller tenant, else its direct owner.
 *
 * Derived from the workspace only — never from the request host — so the
 * builder and the worker always resolve the same credential for the same
 * workspace (the builder's host-first `resolvePlatformOwnerId` is request-only).
 */

type CredentialOwnerWorkspace = Pick<WorkspaceModel, "ownerId" | "tenantId">
export const resolveCredentialOwnerIdForWorkspace = async (
  workspaceId: string,
  loadedWorkspace?: CredentialOwnerWorkspace,
): Promise<string> => {
  const workspace =
    loadedWorkspace ??
    (await workspaceService.find({ where: { id: workspaceId } }))
  if (!workspace) {
    throw notFoundException("Workspace not found")
  }
  if (workspace.tenantId !== ROOT_TENANT_ID) {
    const tenant = await tenantService.findById(workspace.tenantId)
    if (tenant?.ownerId) {
      return tenant.ownerId
    }
  }
  return workspace.ownerId
}
