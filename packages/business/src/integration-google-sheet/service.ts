import { db, eq } from "@chatbotx.io/database/client"
import { integrationModel } from "@chatbotx.io/database/schema"
import { BaseService } from "../base.service"

class IntegrationGoogleSheetService extends BaseService {
  findByWorkspaceId(workspaceId: string) {
    return db.query.integrationGoogleSheetsModel.findFirst({
      where: {
        workspaceId,
      },
    })
  }

  async findByWorkspaceIdOrFail(workspaceId: string) {
    const integration = await this.findByWorkspaceId(workspaceId)
    if (!integration) {
      throw new Error("Integration Google Sheet not found")
    }
    return integration
  }

  async disconnect(integrationId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .delete(integrationModel)
        .where(eq(integrationModel.id, integrationId))
    })
  }
}

export const integrationGoogleSheetService = new IntegrationGoogleSheetService()
