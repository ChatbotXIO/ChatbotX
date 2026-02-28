import { db } from "@aha.chat/database/client"
import type { IntegrationGoogleSheetsResource } from "../schemas"

export const getGoogleSheetsIntegration = async ({
  chatbotId,
}: {
  chatbotId: string
}): Promise<{
  data: IntegrationGoogleSheetsResource | null
}> => {
  const data =
    (await db.query.integrationGoogleSheetsModel.findFirst({
      where: {
        chatbotId,
      },
    })) ?? null

  return {
    data,
  }
}
