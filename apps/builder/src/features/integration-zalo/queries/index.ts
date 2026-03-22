import { db } from "@aha.chat/database/client"
import type { IntegrationZaloModel } from "@aha.chat/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { IntegrationZaloResource } from "../schemas/resource"

export const findIntegrationZalo = async ({
  chatbotId,
}: {
  chatbotId: string
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
  where: { chatbotId?: string; id?: string }
}): Promise<{ data: IntegrationZaloModel[] }> => {
  const data = await db.query.integrationZaloModel.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
