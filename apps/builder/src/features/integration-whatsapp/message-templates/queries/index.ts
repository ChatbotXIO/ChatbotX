import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
) => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  if (input.id) {
    const integrationWhatsapp = await findOrFail({
      table: integrationWhatsappModel,
      where: {
        workspaceId: input.workspaceId,
        id: input.id,
      },
      message: "Whatsapp integration not found",
    })

    return await db.query.whatsappMessageTemplateModel.findMany({
      where: {
        integrationWhatsappId: integrationWhatsapp.id,
      },
      orderBy: { createdAt: "asc" },
    })
  }

  return await db.query.whatsappMessageTemplateModel.findMany({
    where: {
      integrationWhatsapp: {
        workspaceId: input.workspaceId,
      },
    },
    orderBy: { createdAt: "asc" },
  })
}

export const getTemplatesForChatbot = async (
  workspaceId: string,
  status?: string,
) => {
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const filter: {
    integrationWhatsapp: { workspaceId: string }
    status?: string
  } = {
    integrationWhatsapp: { workspaceId },
  }

  if (status) {
    filter.status = status
  }

  return await db.query.whatsappMessageTemplateModel.findMany({
    where: filter,
    orderBy: { name: "asc" },
    with: {
      integrationWhatsapp: {
        columns: {
          id: true,
          inboxId: true,
        },
      },
    },
  })
}
