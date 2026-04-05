import { db } from "@chatbotx.io/database/client"
import type { IntegrationGeminiResource } from "../schemas/resource"

export const findIntegrationGemini = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationGeminiResource | null> =>
  (await db.query.integrationGeminiModel.findFirst({
    where: {
      workspaceId,
    },
  })) ?? null
