import { db, findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import type { IntegrationWhatsappResource } from "../schemas"

export const listIntegrationWhatsapps = async (props: {
  chatbotId: string
}): Promise<PaginatedResponse<IntegrationWhatsappResource>> => {
  const data = await db.query.integrationWhatsappModel.findMany({
    where: props,
    orderBy: {
      createdAt: "asc",
    },
  })

  return { data, pageCount: 1 }
}

export const findIntegrationWhatsapp = async (props: {
  chatbotId: string
  id: string
}): Promise<IntegrationWhatsappResource> => {
  return await findOrFail(
    integrationWhatsappModel,
    props,
    "Whatsapp integration not found",
  )
}
