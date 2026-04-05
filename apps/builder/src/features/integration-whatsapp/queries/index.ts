import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { IntegrationWhatsappResource } from "../schemas"

export const listIntegrationWhatsapps = async (
  props: Pick<IntegrationWhatsappModel, "workspaceId">,
): Promise<PaginatedResponse<IntegrationWhatsappResource>> => {
  const data = await db.query.integrationWhatsappModel.findMany({
    where: props,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data, pageCount: 1 }
}

export const findIntegrationWhatsapp = async (
  props: Pick<IntegrationWhatsappModel, "workspaceId" | "id">,
): Promise<IntegrationWhatsappResource> => {
  return await findOrFail({
    table: integrationWhatsappModel,
    where: props,
    message: "Whatsapp integration not found",
  })
}
