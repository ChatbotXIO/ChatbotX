import { db, findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { MessageTemplateWithComponents } from "../schema/resource"

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
  chatbotId: bigint,
  status?: string,
): Promise<MessageTemplateWithComponents[]> => {
  await assertCurrentUserCanAccessChatbot(chatbotId)

  const filter: {
    integrationWhatsapp: { chatbotId: bigint }
    status?: string
  } = {
    integrationWhatsapp: { chatbotId },
  }

  if (status) {
    filter.status = status
  }

  return await db.query.whatsappMessageTemplateModel.findMany({
    where: filter,
    orderBy: { name: "asc" },
  })
}
