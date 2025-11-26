import { prisma } from "@aha.chat/database"
import type { IntegrationGeminiResource } from "../schemas/resource"

export const findIntegrationGemini = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<IntegrationGeminiResource | null> =>
  await prisma.integrationGemini.findFirst({
    where: {
      chatbotId,
    },
  })
