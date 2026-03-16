import { db, findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageTemplate, MessageTemplateWithComponents } from "../type"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
): Promise<MessageTemplate[]> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
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
    columns: {
      id: true,
      name: true,
      language: true,
      category: true,
      status: true,
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
