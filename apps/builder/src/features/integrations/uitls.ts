import type {
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { getDomainFromHeader } from "@/lib/domain"
import { findOrganization } from "../organization/queries"
import { findChatbotOrFail } from "../workspaces/queries"

export async function identifyChatbotAndOrganizationFromRequest(
  workspaceId?: string | null,
): Promise<{ workspace?: WorkspaceModel; organization: OrganizationModel }> {
  const domain = await getDomainFromHeader()
  const organization = await findOrganization({
    domain,
  })
  if (!organization) {
    throw new Error("Organization not found")
  }

  if (!workspaceId) {
    return { organization }
  }

  const workspace = await findChatbotOrFail({
    id: workspaceId,
    organizationId: organization.id,
  })

  return { workspace, organization }
}
