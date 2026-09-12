import type { ResolvedParticipants } from "@chatbotx.io/business"
import { inboxService } from "@chatbotx.io/business"
import { contactSources } from "@chatbotx.io/database/partials"
import { integrationWhatsappRepository } from "@chatbotx.io/database/repositories"
import type { AuthValue } from "@chatbotx.io/sdk"
import { detectContactAndConversation } from "../received-message"

/**
 * Resolves inbox/contact-inbox/conversation for a FreeSWITCH-originated
 * inbound call, given the DB `IntegrationWhatsapp.id` and the caller/callee
 * numbers off the dialplan's `cbx::call` event — the FreeSWITCH-side
 * counterpart to `resolveCallParticipants` in `whatsapp-call.ts` (which
 * resolves from Meta's `integrationIdentifier`/phone_number_id instead).
 * Both ultimately call the same `detectContactAndConversation` (reuse,
 * never a second resolver); this file exists because the two entry points
 * key off different identifiers and this one must not import anything from
 * the webhook-only module beyond that shared helper.
 */
export const resolveFreeswitchCallParticipants = async (input: {
  workspaceId: string
  integrationId: string
  from: string
  to: string
}): Promise<ResolvedParticipants | null> => {
  const integrationRow =
    await integrationWhatsappRepository.findByIdForWorkspace({
      id: input.integrationId,
      workspaceId: input.workspaceId,
    })
  if (!integrationRow) {
    return null
  }

  const inbox = await inboxService.find({
    where: { id: integrationRow.inboxId, workspaceId: input.workspaceId },
  })
  if (!inbox) {
    return null
  }

  const detected = await detectContactAndConversation({
    inbox,
    // `auth` is stored as validated JSON (`AuthValue`); the repository's
    // raw drizzle type widens it to `unknown` — narrow it back here, the
    // same trust boundary `integrationService.
    // identifyInboxAndIntegrationAuthFromIdentifier` (the webhook path's
    // equivalent lookup) already relies on.
    integrationRow: {
      ...integrationRow,
      auth: integrationRow.auth as AuthValue,
    },
    incomingContact: { sourceId: input.from },
    source: contactSources.enum.inboundMessage,
  })

  return {
    inbox: { id: inbox.id, workspaceId: inbox.workspaceId },
    contactInbox: { id: detected.contactInbox.id },
    conversation: { id: detected.conversation.id },
  }
}
