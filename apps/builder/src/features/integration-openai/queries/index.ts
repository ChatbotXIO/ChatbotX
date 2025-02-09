import { prisma } from "@ahachat.ai/database"
import type { IntegrationOpenAIResource } from "../schemas"

export const findIntegrationOpenAI = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{
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
