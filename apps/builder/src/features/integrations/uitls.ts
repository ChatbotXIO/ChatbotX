import { organizationService } from "@chatbotx.io/business"
import type {
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { getDomainFromHeader } from "@/lib/domain"
import { workspaceService } from "../workspaces/workspace-service"

export async function identifyWorkspaceAndOrganizationFromRequest(
  workspaceId?: string | null,
): Promise<{ workspace?: WorkspaceModel; organization: OrganizationModel }> {
  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

  if (!workspaceId) {
    return { organization }
  }

  const workspace = await workspaceService.findOrFail({
    where: { id: workspaceId, organizationId: organization.id },
  })

  return { workspace, organization }
}
