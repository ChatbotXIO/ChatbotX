import { db } from "@chatbotx.io/database/client"
import type { IntegrationGoogleSheetsResource } from "../schemas"

export const getGoogleSheetsIntegration = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<{
  data: IntegrationGoogleSheetsResource | null
}> => {
  const data =
    (await db.query.integrationGoogleSheetsModel.findFirst({
      where: {
        workspaceId,
      },
    })) ?? null

  return {
    data,
  }
}
