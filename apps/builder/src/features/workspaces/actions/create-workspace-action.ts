import type { Transaction } from "@chatbotx.io/database/client"
import type {
  OrganizationModel,
  WorkspaceModel,
} from "@chatbotx.io/database/types"
import { workspaceService } from "../workspace-service"

export async function createSimpleWorkspace(
  tx: Transaction,
  userId: string,
  organization: OrganizationModel,
  data: Pick<WorkspaceModel, "name" | "organizationId" | "timezone">,
): Promise<WorkspaceModel> {
  return await workspaceService.create({
    tx,
    createdBy: userId,
    organization,
    data,
  })
}
