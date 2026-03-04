import { db } from "@aha.chat/database/client"
import type { IntegrationOpenAIResource } from "../schemas/request"

export const findIntegrationOpenAI = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: IntegrationOpenAIResource | null
}> => {
  const data = await db.query.integrationOpenAIModel.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data: data ?? null,
  }
}
