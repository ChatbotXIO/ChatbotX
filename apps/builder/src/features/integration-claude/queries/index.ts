import { prisma } from "@aha.chat/database"
import type { IntegrationClaudeResource } from "../schemas/request"

export const findIntegrationClaude = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: IntegrationClaudeResource | null
}> => {
  const data = await prisma.integrationClaude.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data,
  }
}
