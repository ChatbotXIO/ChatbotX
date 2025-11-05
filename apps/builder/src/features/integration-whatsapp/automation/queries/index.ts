import { prisma } from "@aha.chat/database"
import type { WhatsappAuthValue } from "@aha.chat/integration-whatsapp"
import {
  type ConversationalAutomation,
  findConversationalAutomation,
} from "@aha.chat/integration-whatsapp/api/phone-number"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListWhatsappPhoneNumberAutomation } from "../schemas/get-ice-breakers-schema"

export const findWhatsappAutomation = async (
  input: ListWhatsappPhoneNumberAutomation,
): Promise<ConversationalAutomation> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp =
    await prisma.integrationWhatsapp.findUniqueOrThrow({
      where: {
        chatbotId: input.chatbotId,
        id: input.id,
      },
    })

  return await findConversationalAutomation(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
