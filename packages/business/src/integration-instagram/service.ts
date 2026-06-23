import { findOrFail } from "@chatbotx.io/database/client"
import { integrationInstagramModel } from "@chatbotx.io/database/schema"

export function findInstagramIntegrationByInboxId(inboxId: string) {
  return findOrFail({ table: integrationInstagramModel, where: { inboxId } })
}
