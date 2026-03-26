import { db, findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageTemplateWithComponents } from "../type"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
) => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  if (input.id) {
    const integrationWhatsapp = await findOrFail(
      integrationWhatsappModel,
      {
        chatbotId: input.chatbotId,
        id: input.id,
      },
      "Whatsapp integration not found",
    )

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
        chatbotId: input.chatbotId,
      },
    },
    orderBy: { createdAt: "asc" },
  })
}

export const getTemplatesForChatbot = async (
  chatbotId: string,
  status?: string,
): Promise<MessageTemplateWithComponents[]> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const filter: {
    integrationWhatsapp: { chatbotId: string }
    status?: string
  } = {
    integrationWhatsapp: { chatbotId },
  }

  if (status) {
    filter.status = status
  }

  return await db.query.whatsappMessageTemplateModel.findMany({
    where: filter,
    columns: {
      id: true,
      name: true,
      language: true,
      category: true,
      status: true,
      components: true,
      sourceId: true,
    },
    orderBy: { name: "asc" },
  })
}
