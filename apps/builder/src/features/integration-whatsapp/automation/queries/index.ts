import { integrationWhatsappService } from "@chatbotx.io/business"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  type ConversationalAutomation,
  findConversationalAutomation,
} from "@chatbotx.io/integration-whatsapp/api/phone-number"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { ListWhatsappPhoneNumberAutomation } from "../schema/get-ice-breakers-schema"

export const findWhatsappAutomation = async (
  input: ListWhatsappPhoneNumberAutomation,
): Promise<ConversationalAutomation> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const integrationWhatsapp =
    await integrationWhatsappService.findByIdForWorkspace({
      workspaceId: input.workspaceId,
      id: input.id,
    })
  if (!integrationWhatsapp) {
    throw new Error("Whatsapp integration not found")
  }

  return await findConversationalAutomation(
    integrationWhatsapp.auth as WhatsappAuthValue,
  )
}
