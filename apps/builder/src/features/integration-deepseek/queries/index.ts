import { prisma } from "@aha.chat/database"
import type { IntegrationDeepSeekResource } from "../schemas/request"

export const findIntegrationDeepSeek = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: IntegrationDeepSeekResource | null
}> => {
  const data = await prisma.integrationDeepSeek.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data,
  }
}
