import { invitationService } from "@chatbotx.io/business"

/**
 * Not a server action (`"use server"`): this reads full invitation details and
 * must only ever be called from the invitation page itself, never invoked
 * directly from the client as an arbitrary RPC.
 */
export async function findInvitation({
  code,
  tenantId,
}: {
  code: string
  tenantId: string
}) {
  return await invitationService.getInvitationDetails(code, { tenantId })
}
