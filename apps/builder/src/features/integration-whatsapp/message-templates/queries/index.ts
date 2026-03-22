import { findOrFail } from "@aha.chat/database/client"
import { integrationWhatsappModel } from "@aha.chat/database/schema"
import type { IntegrationWhatsappModel } from "@aha.chat/database/types"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ListMessageTemplatesReponse,
  listMessageTemplates,
} from "@aha.chat/integration-whatsapp/api/waba"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
): Promise<ListMessageTemplatesReponse> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp = await findOrFail<IntegrationWhatsappModel>(
    integrationWhatsappModel,
    {
      chatbotId: input.chatbotId,
      id: input.id,
    },
    "Whatsapp integration not found",
  )

  return await listMessageTemplates(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
