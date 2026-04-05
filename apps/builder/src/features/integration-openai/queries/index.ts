import { db } from "@chatbotx.io/database/client"
import type { IntegrationOpenAIResource } from "../schemas/request"

export const findIntegrationOpenAI = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{
  data: IntegrationOpenAIResource | null
}> => {
  const data = await db.query.integrationOpenaiModel.findFirst({
    where: {
      workspaceId,
    },
  })

  return {
    data: data ?? null,
  }
}
