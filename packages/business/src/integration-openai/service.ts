import { db, eq } from "@chatbotx.io/database/client"
import { integrationModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class IntegrationOpenAIService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationOpenaiModel.findFirst({ where: { workspaceId } })
  }

  async disconnect(workspaceId: string) {
    const existing = await this.findByWorkspaceId(workspaceId)
    if (!existing) {
      return
    }
    await db
      .delete(integrationModel)
      .where(eq(integrationModel.id, existing.integrationId))
  }
}

export const integrationOpenAIService = new IntegrationOpenAIService()
