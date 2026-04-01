import { db } from "@chatbotx.io/database/client"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { IntegrationZaloResource } from "../schemas/resource"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: bigint
}): Promise<IntegrationZaloResource | null> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  return (
    (await db.query.integrationZaloModel.findFirst({
      where: {
        chatbotId,
      },
    })) ?? null
  )
}

export const listIntegrationZalo = async ({
  where,
}: {
  where: Partial<Pick<IntegrationZaloModel, "chatbotId" | "id">>
}): Promise<{ data: IntegrationZaloModel[] }> => {
  const data = await db.query.integrationZaloModel.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
