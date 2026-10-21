"use server"

import { invitationService } from "@chatbotx.io/business"

export async function findInvitation({ code }: { code: string }) {
  return await invitationService.getInvitationDetails(code)
}
