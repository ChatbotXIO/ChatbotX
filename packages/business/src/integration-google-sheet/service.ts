import { db } from "@chatbotx.io/database/client"
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
}

export const integrationGoogleSheetService = new IntegrationGoogleSheetService()
