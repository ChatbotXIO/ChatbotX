import { db } from "@chatbotx.io/database/client"
import type { IntegrationGeminiResource } from "../schemas/resource"

export const findIntegrationGemini = async ({
  chatbotId,
}: {
  chatbotId: bigint
}): Promise<IntegrationGeminiResource | null> =>
  (await db.query.integrationGeminiModel.findFirst({
    where: {
      chatbotId,
    },
  })) ?? null
