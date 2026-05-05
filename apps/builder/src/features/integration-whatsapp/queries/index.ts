import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { IntegrationWhatsappModel } from "@chatbotx.io/database/types"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
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
    with: {
      inbox: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
  })

  return { data, pageCount: 1 }
}

export const findIntegrationWhatsapp = async (
  props: Pick<IntegrationWhatsappModel, "workspaceId" | "id">,
): Promise<IntegrationWhatsappResource> =>
  await findOrFail({
    table: integrationWhatsappModel,
    where: props,
    message: "Whatsapp integration not found",
  })

export const findIntegrationWhatsappById = async (
  id: IntegrationWhatsappModel["id"],
): Promise<IntegrationWhatsappModel | null> => {
  const integration = await db.query.integrationWhatsappModel.findFirst({
    where: { id },
  })

  return integration ?? null
}

export const markWhatsappWebhookVerified = async (
  id: IntegrationWhatsappModel["id"],
  current: WhatsappAuthValue,
): Promise<void> => {
  const updatedAuth: WhatsappAuthValue = {
    ...current,
    metadata: {
      ...current.metadata,
      webhookVerifiedAt: new Date().toISOString(),
    },
  }

  await db
    .update(integrationWhatsappModel)
    .set({ auth: updatedAuth })
    .where(eq(integrationWhatsappModel.id, id))
}
