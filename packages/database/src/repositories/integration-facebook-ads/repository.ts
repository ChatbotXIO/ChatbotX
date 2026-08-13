import type { DatabaseClient } from "../../client"
import { db } from "../../client"
import type { integrationFacebookAdsModel } from "../../schema"

type IntegrationFacebookAdsModel =
  typeof integrationFacebookAdsModel.$inferSelect

type WorkspaceIntegrationRef = {
  id: string
  workspaceId: string
}

export const integrationFacebookAdsRepository = {
  async findWorkspaceIntegration(
    input: WorkspaceIntegrationRef,
    tx: DatabaseClient = db,
  ): Promise<IntegrationFacebookAdsModel | null> {
    const row = await tx.query.integrationFacebookAdsModel.findFirst({
      where: {
        id: input.id,
        workspaceId: input.workspaceId,
      },
    })

    return row ?? null
  },
}
