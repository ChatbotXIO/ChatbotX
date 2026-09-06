import type { DatabaseClient } from "@chatbotx.io/database/client"
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

  /**
   * Deletes the parent `Integration` row; the `IntegrationGoogleSheet` row
   * cascades via its FK (see `packages/database/src/schema/
   * integration-google-sheets.ts`).
   */
  async disconnect(input: {
    workspaceId: string
    integrationId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { integrationId, tx = db } = input

    await tx
      .delete(integrationModel)
      .where(eq(integrationModel.id, integrationId))
  }
}

export const integrationGoogleSheetService = new IntegrationGoogleSheetService()
