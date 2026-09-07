import { messengerIntegrationService } from "@chatbotx.io/business"
import type { IntegrationMessengerModel } from "@chatbotx.io/database/types"

export const findIntegrationMessenger = async (
  input: Partial<Pick<IntegrationMessengerModel, "id" | "workspaceId">>,
): Promise<IntegrationMessengerModel> => {
  const integration = await messengerIntegrationService.findByIdForWorkspace({
    id: input.id as string,
    workspaceId: input.workspaceId as string,
  })

  if (!integration) {
    throw new Error("Integration Messenger not found")
  }

  return integration
}

export const listIntegrationMessengers = async (
  input: Partial<Pick<IntegrationMessengerModel, "id" | "workspaceId">>,
): Promise<{ data: IntegrationMessengerModel[] }> => {
  const data = await messengerIntegrationService.listForWorkspace({
    workspaceId: input.workspaceId as string,
    id: input.id,
  })

  return { data }
}
