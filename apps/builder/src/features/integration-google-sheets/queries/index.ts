import { prisma } from "@ahachat.ai/database"
import type { IntegrationGoogleSheetsResource } from "../schemas"

export const getGoogleSheetsIntegration = async ({
  chatbotId,
}: { chatbotId: string }): Promise<{
  data: IntegrationGoogleSheetsResource | null
}> => {
  const data = await prisma.integrationGoogleSheets.findFirst({
    where: {
      chatbotId,
    },
  })

  return {
    data,
  }
}
