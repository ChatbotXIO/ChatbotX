import {
  type BroadcastSubaction,
  broadcastSubactions,
  type ChannelType,
  channelTypes,
} from "@chatbotx.io/database/partials"
import type { ContactFilterCriteria } from "@/features/contact-filter/schemas"

const EMPTY_CONTACT_FILTER: ContactFilterCriteria = {
  operator: "and",
  conditions: [],
}

export type CreateBroadcastDefaultValues = {
  channel: ChannelType | undefined
  flowId: undefined
  subaction: BroadcastSubaction | undefined
  integrationWhatsappId: string | undefined
  schedulesType: "now"
  schedulesAt: null
  contactFilter: ContactFilterCriteria
}

/**
 * Seeds `CreateBroadcastForm`'s `defaultValues` from an optional deep-link
 * prefill (Ads Analytics' per-ad "Retarget → Send WhatsApp broadcast →
 * {segment}"). WhatsApp needs a template subaction — the audience can be
 * older than the 24h session window — so a prefilled WhatsApp channel always
 * defaults to `whatsappTemplateMessage`. When `initialChannel` is set, the
 * channel-picker step is skipped because `watchedChannel` is already
 * non-empty.
 */
export function buildCreateBroadcastDefaultValues(input: {
  initialChannel?: ChannelType
  initialIntegrationWhatsappId?: string
  initialContactFilter?: ContactFilterCriteria
}): CreateBroadcastDefaultValues {
  return {
    channel: input.initialChannel,
    flowId: undefined,
    subaction:
      input.initialChannel === channelTypes.enum.whatsapp
        ? broadcastSubactions.enum.whatsappTemplateMessage
        : undefined,
    integrationWhatsappId: input.initialIntegrationWhatsappId,
    schedulesType: "now",
    schedulesAt: null,
    contactFilter: input.initialContactFilter ?? EMPTY_CONTACT_FILTER,
  }
}
