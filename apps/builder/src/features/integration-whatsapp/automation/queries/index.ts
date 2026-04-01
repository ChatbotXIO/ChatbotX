import { findOrFail } from "@chatbotx.io/database/client"
import { integrationWhatsappModel } from "@chatbotx.io/database/schema"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  type ConversationalAutomation,
  findConversationalAutomation,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListWhatsappPhoneNumberAutomation } from "../schemas/get-ice-breakers-schema"

export const findWhatsappAutomation = async (
  input: ListWhatsappPhoneNumberAutomation,
): Promise<ConversationalAutomation> => {
  await assertCurrentUserCanAccessChatbot(input.chatbotId)

  const integrationWhatsapp = await findOrFail(
    integrationWhatsappModel,
    {
      chatbotId: input.chatbotId,
      id: input.id,
    },
    "Whatsapp integration not found",
  )

  return await findConversationalAutomation(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
