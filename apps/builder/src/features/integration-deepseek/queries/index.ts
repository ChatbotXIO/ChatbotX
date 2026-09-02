import { db } from "@chatbotx.io/database/client"
import type { IntegrationDeepseekResource } from "../schema/resource"

export const findIntegrationDeepSeek = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationDeepseekResource | null> =>
  (await db.query.integrationDeepseekModel.findFirst({
    where: { workspaceId },
  })) ?? null
