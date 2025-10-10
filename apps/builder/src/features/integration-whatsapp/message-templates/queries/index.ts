import { prisma } from "@aha.chat/database"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ListMessageTemplatesReponse,
  listMessageTemplates,
} from "@aha.chat/integration-whatsapp/api/waba"
import type { ListMessageTemplatesRequest } from "@/features/integration-whatsapp/message-templates/schemas/get-message-templates-schema"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export const getMessageTemplates = async (
  input: ListMessageTemplatesRequest,
): Promise<ListMessageTemplatesReponse> => {
  const userId = await getCurrentUserId()
  await findChatbotOrFail(userId, input.chatbotId)

  const integrationWhatsapp =
    await prisma.integrationWhatsapp.findUniqueOrThrow({
      where: {
        chatbotId: input.chatbotId,
        id: input.id,
      },
    })

  return await listMessageTemplates(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
