import { db } from "@aha.chat/database/client"
import type { IntegrationGeminiResource } from "../schemas/resource"

export const findIntegrationGemini = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationGeminiResource | null> =>
  (await db.query.integrationGeminiModel.findFirst({
    where: {
      chatbotId,
    },
  })) ?? null
