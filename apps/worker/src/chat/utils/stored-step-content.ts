import type { PreparedChannelPostShare } from "@chatbotx.io/business"
import { type ContentType, contentTypes } from "@chatbotx.io/database/partials"
import type { WhatsappLocationStepSchema } from "@chatbotx.io/flow-config"
import { stepTypes } from "@chatbotx.io/flow-config"
import type {
  MessageChannelPostEntity,
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
    | MessageChannelPostEntity
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

/**
 * `channelPost` is the post a `sendChannelPost` step resolved to. When there is
 * one, the row stores its real text (the built text of a `textLink` share) and
 * the post card, whatever step the channel is handed.
 */
export const resolveStoredStepContent = (
  step: SendFlowStepData,
  channelPost?: Pick<PreparedChannelPostShare, "text" | "contentAttributes">,
): StoredStepContent => {
  if (channelPost) {
    return {
      contentType: contentTypes.enum.text,
      text: channelPost.text,
      contentAttributes: channelPost.contentAttributes,
    }
  }
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
