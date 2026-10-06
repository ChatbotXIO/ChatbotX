import {
  messengerIntegrationService,
  workspaceService,
} from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { notFoundException } from "@chatbotx.io/business/errors"
import { disconnectMessengerConnection } from "@chatbotx.io/connections/messenger-teardown"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"

export const disconnectMessenger = async (ctx: {
  workspaceId: string
  id: string
}) => {
  const [integrationMessenger, workspace] = await Promise.all([
    messengerIntegrationService.findByIdForWorkspace({
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    }),
    workspaceService.findById({ id: ctx.workspaceId }),
  ])

  if (!integrationMessenger) {
    throw notFoundException("Messenger channel not found")
  }

  await disconnectMessengerConnection({
    workspaceId: ctx.workspaceId,
    integrationId: integrationMessenger.id,
    inboxId: integrationMessenger.inboxId,
    ownerId: workspace.ownerId,
    auth: integrationMessenger.auth as MessengerAuthValue,
  })

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "disconnect",
    detail: `disconnected the Messenger channel (#${integrationMessenger.id})`,
  })
}
