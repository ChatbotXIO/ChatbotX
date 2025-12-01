import { prisma } from "@aha.chat/database"
import type { IntegrationOpenAIResource } from "../schemas/request"

export const findIntegrationOpenAI = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: IntegrationOpenAIResource | null
}> => {
  const data = await prisma.integrationOpenAI.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data,
  }
}
