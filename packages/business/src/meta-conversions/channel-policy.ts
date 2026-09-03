import {
  type MetaCapiActionSource,
  metaCapiActionSourcePolicy,
} from "@chatbotx.io/utils/meta-capi"
import type { MetaConversionsChannel } from "./schema"

type ChannelIdentityRules = {
  /** Meta only accepts the event when the contact carries a click-to-ad id. */
  requiresCtwaClid: boolean
  /** Meta caps CAPI at one event per ad, so one event per contact per UTC day. */
  dedupsPerUtcDay: boolean
}

/**
 * Per-channel rules for events sent with the messaging identity. WhatsApp
 * business-messaging events are keyed to the click-to-WhatsApp ad
 * (`ctwa_clid`); Messenger and Instagram have no such constraint. Every
 * channel-specific branch on the CAPI send/dedup path reads this map instead
 * of comparing channel literals.
 */
const channelIdentityRules = {
  messenger: { requiresCtwaClid: false, dedupsPerUtcDay: false },
  instagram: { requiresCtwaClid: false, dedupsPerUtcDay: false },
  whatsapp: { requiresCtwaClid: true, dedupsPerUtcDay: true },
} as const satisfies Record<MetaConversionsChannel, ChannelIdentityRules>

const usesMessagingIdentity = (actionSource: MetaCapiActionSource): boolean =>
  metaCapiActionSourcePolicy[actionSource].usesMessagingIdentity

/** Whether an event on this channel/action source needs a `ctwa_clid` to be sendable. */
export const capiEventRequiresCtwaClid = (
  channel: MetaConversionsChannel,
  actionSource: MetaCapiActionSource,
): boolean =>
  channelIdentityRules[channel].requiresCtwaClid &&
  usesMessagingIdentity(actionSource)

/** Whether an event on this channel/action source dedups per contact per UTC day. */
export const capiEventDedupsPerUtcDay = (
  channel: MetaConversionsChannel,
  actionSource: MetaCapiActionSource,
): boolean =>
  channelIdentityRules[channel].dedupsPerUtcDay &&
  usesMessagingIdentity(actionSource)
