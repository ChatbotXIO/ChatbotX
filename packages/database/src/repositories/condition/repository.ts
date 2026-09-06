import { type DatabaseClient, db } from "../../client"

export const conditionRepository = {
  async listByTriggerIds(triggerIds: string[], tx: DatabaseClient = db) {
    if (triggerIds.length === 0) {
      return []
    }
    return await tx.query.conditionModel.findMany({
      where: { triggerId: { in: triggerIds } },
    })
  },

  async listByWebhookIds(webhookIds: string[], tx: DatabaseClient = db) {
    if (webhookIds.length === 0) {
      return []
    }
    return await tx.query.conditionModel.findMany({
      where: { webhookId: { in: webhookIds } },
    })
  },
}
