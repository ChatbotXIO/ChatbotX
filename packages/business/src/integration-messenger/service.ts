import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationMessengerModel } from "@chatbotx.io/database/schema"

export function findMessengerIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationMessengerModel, where: { inboxId } })
}

export function findMessengerIntegrationsByWorkspaceId(workspaceId: string) {
  return db.query.integrationMessengerModel.findMany({
    where: { workspaceId },
  })
}
