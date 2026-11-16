import { lineIntegrationService, workspaceService } from "@chatbotx.io/business"
import { auditService } from "@chatbotx.io/business/audit"
import { checkConnectedLineWebhook } from "./connect-line"

type LineChannelRef = { workspaceId: string; id: string }

/** Disconnect a LINE channel and its inbox. Shared by the UI action and the public API. */
export async function disconnectLineChannel({
  workspaceId,
  id,
}: LineChannelRef): Promise<void> {
  const [row, workspace] = await Promise.all([
    lineIntegrationService.findById({ id, workspaceId }),
    workspaceService.findById({ id: workspaceId }),
  ])
  await lineIntegrationService.disconnect({
    workspaceId,
    id: row.id,
    inboxId: row.inboxId,
    ownerId: workspace.ownerId,
  })
  await auditService.record({
    action: "disconnect",
    detail: `disconnected the LINE channel (#${row.id})`,
  })
}

/** Run LINE's webhook test for a connected channel. Shared by the UI action and the public API. */
export async function testLineWebhook({ workspaceId, id }: LineChannelRef) {
  const row = await lineIntegrationService.findById({ id, workspaceId })
  const check = await checkConnectedLineWebhook(row)
  return {
    success: check.testOk,
    reason: check.testReason,
    active: check.active,
  }
}
