import {
  contactSources,
  type IntegrationType,
} from "@chatbotx.io/database/partials"
import { integrationService } from "../../../services/integrations"
import { detectContactAndConversation } from "../received-message"

/**
 * Create the contact for a channel user who was labelled before the inbox ever
 * saw them (no message yet, or not imported). Reuses the inbound-message
 * creation path, so the profile lookup, the MAC (billing) gate and the
 * concurrent-create race handling behave exactly as for a first message.
 * Errors propagate so the label job retries; a MAC-limit rejection is
 * unrecoverable and fails the job once.
 */
export async function createLabelledContact(props: {
  integrationType: IntegrationType
  integrationIdentifier: string
  sourceId: string
}): Promise<void> {
  const { inbox, integrationRow } =
    await integrationService.identifyInboxAndIntegrationAuthFromIdentifier(
      props.integrationType,
      props.integrationIdentifier,
    )
  await detectContactAndConversation({
    inbox,
    integrationRow,
    incomingContact: { sourceId: props.sourceId },
    source: contactSources.enum.imported,
  })
}
