import { db } from "@chatbotx.io/database/client"
import type { IntegrationZaloModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { IntegrationZaloResource } from "../schemas/resource"

export const findIntegrationZalo = async ({
  workspaceId,
}: {
  workspaceId: string
}): Promise<IntegrationZaloResource | null> => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  return (
    (await db.query.integrationZaloModel.findFirst({
      where: {
        workspaceId,
      },
    })) ?? null
  )
}

export const listIntegrationZalo = async ({
  where,
}: {
  where: Partial<Pick<IntegrationZaloModel, "workspaceId" | "id">>
}): Promise<{ data: IntegrationZaloModel[] }> => {
  const data = await db.query.integrationZaloModel.findMany({
    where,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data }
}
