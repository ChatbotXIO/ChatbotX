import type { OutgoingContact } from "@chatbotx.io/sdk"
import { findRegisteredPersona } from "../../../lib/persona"
import type { MessengerIntegrationDetail } from "../../../schema"

/**
 * Resolve the Facebook `persona_id` for an outbound message. When the contact
 * has a persona selected (`contact.personaId`, a local persona id set by the
 * "Set Persona" flow action), resolve it to the page's current Facebook persona
 * id via the configured personas list. Falls back to the page default persona
 * when the contact has none, or when the chosen persona was deleted / never
 * registered (self-healing per the tolerate-at-send design).
 */
export const resolveMessengerPersonaId = (
  detail: MessengerIntegrationDetail | undefined,
  contact: OutgoingContact,
): string | undefined => {
  if (contact.personaId) {
    const match = findRegisteredPersona(detail?.personas, contact.personaId)
    if (match) {
      return match.facebookPersonaId ?? undefined
    }
  }
  return detail?.personaId || undefined
}
