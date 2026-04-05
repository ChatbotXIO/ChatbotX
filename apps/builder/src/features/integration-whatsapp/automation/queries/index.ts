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
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const integrationWhatsapp = await findOrFail({
    table: integrationWhatsappModel,
    where: {
      workspaceId: input.workspaceId,
      id: input.id,
    },
    message: "Whatsapp integration not found",
  })

  return await findConversationalAutomation(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
