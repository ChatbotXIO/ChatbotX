import type {
  MetaConversionsChannel,
  MetaConversionsIntegrationByChannel,
} from "./schema"

/**
 * The per-channel identity keys Meta's business-messaging endpoint requires.
 * Each builder pairs the integration's own id (page / IG account / WABA) with
 * the person's messaging id for that channel: a page-scoped user id, an
 * IG-scoped user id, or a click-to-WhatsApp click id. Shared by the worker
 * send path and the "Send test event" action so the two can never drift.
 */
const channelIdentityBuilders = {
  messenger: (
    integration: MetaConversionsIntegrationByChannel["messenger"],
    messagingId: string,
  ) => ({
    messagingChannel: "messenger" as const,
    pageId: integration.pageId,
    pageScopedUserId: messagingId,
  }),
  instagram: (
    integration: MetaConversionsIntegrationByChannel["instagram"],
    messagingId: string,
  ) => ({
    messagingChannel: "instagram" as const,
    instagramBusinessAccountId: integration.igId,
    igSid: messagingId,
  }),
  whatsapp: (
    integration: MetaConversionsIntegrationByChannel["whatsapp"],
    messagingId: string,
  ) => ({
    messagingChannel: "whatsapp" as const,
    wabaId: integration.wabaId,
    ctwaClid: messagingId,
  }),
} satisfies {
  [TChannel in MetaConversionsChannel]: (
    integration: MetaConversionsIntegrationByChannel[TChannel],
    messagingId: string,
  ) => Record<string, string>
}

export type ChannelIdentity<
  TChannel extends MetaConversionsChannel = MetaConversionsChannel,
> = ReturnType<(typeof channelIdentityBuilders)[TChannel]>

// Indexing `channelIdentityBuilders` by a generic `TChannel` narrows the
// integration parameter to the INTERSECTION of all three channels' shapes —
// a shape no single value can satisfy structurally, even though the caller's
// channel tag guarantees the match is safe at runtime. This is the ONE
// documented cast in this file, mirroring `byMessagingChannel` in
// `integrations/meta-conversions/src/apis/events.ts`.
export function buildChannelIdentity<TChannel extends MetaConversionsChannel>(
  channel: TChannel,
  integration: MetaConversionsIntegrationByChannel[TChannel],
  messagingId: string,
): ChannelIdentity<TChannel> {
  const builder = channelIdentityBuilders[channel] as unknown as (
    integration: MetaConversionsIntegrationByChannel[TChannel],
    messagingId: string,
  ) => ChannelIdentity<TChannel>
  return builder(integration, messagingId)
}

export type ContactMessagingIdInput = {
  sourceId: string
  ctwaClid?: string | null
}

const contactMessagingIdResolvers = {
  messenger: (contactInbox) => contactInbox.sourceId,
  instagram: (contactInbox) => contactInbox.sourceId,
  whatsapp: (contactInbox) => {
    if (!contactInbox.ctwaClid) {
      // Defensive: the worker already gates on this via `skipped_no_identity`
      // before building the identity — this should be unreachable.
      throw new Error("Missing ctwa_clid for WhatsApp Meta CAPI event")
    }
    return contactInbox.ctwaClid
  },
} satisfies {
  [TChannel in MetaConversionsChannel]: (
    contactInbox: ContactMessagingIdInput,
  ) => string
}

/**
 * The messaging id a stored contact-inbox contributes to a business-messaging
 * event: its source id (page-scoped / IG-scoped user id) for Messenger and
 * Instagram, or its click-to-WhatsApp click id for WhatsApp — never the phone
 * number, which Meta rejects as an identity for a WhatsApp event.
 */
export function resolveContactMessagingId(
  channel: MetaConversionsChannel,
  contactInbox: ContactMessagingIdInput,
): string {
  return contactMessagingIdResolvers[channel](contactInbox)
}
