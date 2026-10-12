import { type ContentType, contentTypes } from "@chatbotx.io/database/partials"
import type { WhatsappLocationStepSchema } from "@chatbotx.io/flow-config"
import { stepTypes } from "@chatbotx.io/flow-config"
import type {
  MessageLocationEntity,
  MessageViewCatalogEntity,
  SendFlowStepData,
} from "@chatbotx.io/sdk"

/** How a delivered flow step is recorded on its outgoing Message row. */
export type StoredStepContent = {
  contentType: ContentType
  text: string | null
  contentAttributes?:
    | (MessageLocationEntity & {
        name?: string
        address?: string
      })
    | { viewCatalog: MessageViewCatalogEntity }
}

/**
 * Stored like an inbound location (`parseLocationMessage`), so the inbox reads
 * one shape in both directions: a "name: address" label plus the coordinates.
 */
const toStoredLocation = (
  step: WhatsappLocationStepSchema,
): StoredStepContent => ({
  contentType: contentTypes.enum.location,
  text:
    [step.name, step.address].filter(Boolean).join(": ") ||
    `${step.latitude}, ${step.longitude}`,
  contentAttributes: {
    latitude: String(step.latitude),
    longitude: String(step.longitude),
    name: step.name || undefined,
    address: step.address || undefined,
  },
})

export const resolveStoredStepContent = (
  step: SendFlowStepData,
): StoredStepContent => {
  switch (step.stepType) {
    case stepTypes.enum.sendText:
    case stepTypes.enum.whatsappCallButton:
      return { contentType: contentTypes.enum.text, text: step.text }
    case stepTypes.enum.whatsappLocation:
      return toStoredLocation(step)
    // The text alone reads like any other reply, so the message is marked: the
    // inbox shows the footer and the catalog button the contact sees from it.
    case stepTypes.enum.sendViewCatalog:
      return {
        contentType: contentTypes.enum.text,
        text: step.text,
        contentAttributes: { viewCatalog: { footer: step.footer } },
      }
    default:
      return { contentType: contentTypes.enum.text, text: null }
  }
}
