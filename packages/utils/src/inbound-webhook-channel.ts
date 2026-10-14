import { z } from "zod"
import { type ChannelType, channelTypes } from "./channel"

/**
 * How an inbound webhook finds the inbox it targets from a value in the
 * payload, and which identities it can use to find or create a contact on
 * that inbox. One channel can own many inboxes, so the payload carries the
 * channel's own external inbox id (Messenger page id, WhatsApp phone number id…).
 */

/** Stable names for the external inbox identifiers a payload can carry. */
export const inboxIdentifierKinds = z.enum([
  "pageId",
  "igId",
  "phoneNumberId",
  "displayPhoneNumber",
  "botId",
  "oaId",
  "openId",
  "threadsUserId",
])
export type InboxIdentifierKind = z.infer<typeof inboxIdentifierKinds>

/** The lookup each identifier is resolved with (implemented in business). */
export const inboxLookupStrategies = z.enum([
  "inboxSourceId",
  "connectionSourceId",
  "whatsappDisplayPhone",
])
export type InboxLookupStrategy = z.infer<typeof inboxLookupStrategies>

/**
 * What a payload can identify a contact by, on the resolved inbox. The option
 * order is the lookup order: the first kind with a value in the payload is the
 * one the contact is searched by.
 */
export const contactIdentityKinds = z.enum([
  "channelUserId",
  "phone",
  "email",
  "fullName",
])
export type ContactIdentityKind = z.infer<typeof contactIdentityKinds>
export const CONTACT_LOOKUP_ORDER: readonly ContactIdentityKind[] =
  contactIdentityKinds.options

/** The meaning of `channelUserId` per channel (labels live in the UI). */
export const channelUserIdKinds = z.enum([
  "psid",
  "igsid",
  "telegramChatId",
  "zaloUserId",
  "tiktokCustomerOpenId",
  "threadsUsername",
  "whatsappId",
  "apiSourceId",
])
export type ChannelUserIdKind = z.infer<typeof channelUserIdKinds>

export type InboundWebhookChannelSpec = {
  /** Identifiers that resolve an inbox from the payload; empty = fixed inbox only. */
  inboxIdentifiers: ReadonlyArray<{
    kind: InboxIdentifierKind
    strategy: InboxLookupStrategy
    /** A `$` path to show as the input placeholder. */
    examplePath: string
  }>
  /** The channel's own contact id (PSID, IGSID…); `null` when it has none. */
  channelUserId: { kind: ChannelUserIdKind; examplePath: string } | null
  /**
   * Identities that can CREATE a contact on this channel (finding works with any
   * identity). Without one of them in the payload, an unknown contact is skipped.
   */
  creationIdentities: readonly ContactIdentityKind[]
}

const noInboxIdentifiers: InboundWebhookChannelSpec["inboxIdentifiers"] = []

/**
 * Exhaustive on purpose: adding a `ChannelType` fails to compile until its
 * entry exists. Mirrors how each integration stores its ids
 * (`integrations/<channel>/src/integration.ts` `describe()`) and keys its
 * contacts (`integrations/<channel>/src/handlers/**`).
 */
export const INBOUND_WEBHOOK_CHANNEL_SPECS: Record<
  ChannelType,
  InboundWebhookChannelSpec
> = {
  omnichannel: {
    inboxIdentifiers: noInboxIdentifiers,
    channelUserId: null,
    creationIdentities: [],
  },
  webchat: {
    inboxIdentifiers: noInboxIdentifiers,
    channelUserId: null,
    creationIdentities: ["phone", "email"],
  },
  smtp: {
    inboxIdentifiers: noInboxIdentifiers,
    channelUserId: null,
    creationIdentities: ["email"],
  },
  api: {
    inboxIdentifiers: noInboxIdentifiers,
    channelUserId: { kind: "apiSourceId", examplePath: "$.contact.id" },
    creationIdentities: ["channelUserId"],
  },
  messenger: {
    inboxIdentifiers: [
      {
        kind: "pageId",
        strategy: "inboxSourceId",
        examplePath: "$.entry[0].id",
      },
    ],
    channelUserId: { kind: "psid", examplePath: "$.sender.id" },
    creationIdentities: ["channelUserId"],
  },
  instagram: {
    inboxIdentifiers: [
      {
        kind: "igId",
        strategy: "inboxSourceId",
        examplePath: "$.entry[0].id",
      },
    ],
    channelUserId: { kind: "igsid", examplePath: "$.sender.id" },
    creationIdentities: ["channelUserId"],
  },
  // `wa_id` is the E.164 digits, so a WhatsApp contact is created from its phone.
  whatsapp: {
    inboxIdentifiers: [
      {
        kind: "phoneNumberId",
        strategy: "inboxSourceId",
        examplePath: "$.metadata.phone_number_id",
      },
      {
        kind: "displayPhoneNumber",
        strategy: "whatsappDisplayPhone",
        examplePath: "$.metadata.display_phone_number",
      },
    ],
    channelUserId: { kind: "whatsappId", examplePath: "$.contacts[0].wa_id" },
    creationIdentities: ["phone"],
  },
  telegram: {
    inboxIdentifiers: [
      {
        kind: "botId",
        strategy: "inboxSourceId",
        examplePath: "$.bot.id",
      },
    ],
    channelUserId: { kind: "telegramChatId", examplePath: "$.chat.id" },
    creationIdentities: ["channelUserId"],
  },
  zalo: {
    inboxIdentifiers: [
      {
        kind: "oaId",
        strategy: "inboxSourceId",
        examplePath: "$.oa_id",
      },
    ],
    channelUserId: { kind: "zaloUserId", examplePath: "$.user_id" },
    creationIdentities: ["channelUserId"],
  },
  // The TikTok connect path in business stores the username as `Inbox.sourceId`
  // while `Connection.sourceId` is always the account open id.
  tiktok: {
    inboxIdentifiers: [
      {
        kind: "openId",
        strategy: "connectionSourceId",
        examplePath: "$.open_id",
      },
    ],
    channelUserId: {
      kind: "tiktokCustomerOpenId",
      examplePath: "$.customer.open_id",
    },
    creationIdentities: ["channelUserId"],
  },
  threads: {
    inboxIdentifiers: [
      {
        kind: "threadsUserId",
        strategy: "inboxSourceId",
        examplePath: "$.user_id",
      },
    ],
    channelUserId: { kind: "threadsUsername", examplePath: "$.user.username" },
    creationIdentities: ["channelUserId"],
  },
}

/** Placeholder for the channel user id path when no channel is chosen yet, or it has no id of its own. */
export const GENERIC_CHANNEL_USER_ID_EXAMPLE_PATH = "$.contact.id"

/** Channels whose inbox can be resolved from a payload value. */
export const PAYLOAD_RESOLVABLE_CHANNELS: readonly ChannelType[] =
  channelTypes.options.filter(
    (channel) => INBOUND_WEBHOOK_CHANNEL_SPECS[channel].inboxIdentifiers.length,
  )

/**
 * The identities this channel can create a contact from, when none of them is
 * configured; `[]` when at least one is, or when the channel creates none. A
 * webhook without one still works for contacts that already exist.
 */
export const missingCreationIdentityKinds = (
  channel: ChannelType,
  configuredKinds: readonly ContactIdentityKind[],
): readonly ContactIdentityKind[] => {
  const { creationIdentities } = INBOUND_WEBHOOK_CHANNEL_SPECS[channel]
  return creationIdentities.some((kind) => configuredKinds.includes(kind))
    ? []
    : creationIdentities
}

export const getInboxIdentifierStrategy = (
  channel: ChannelType,
  kind: InboxIdentifierKind,
): InboxLookupStrategy | undefined =>
  INBOUND_WEBHOOK_CHANNEL_SPECS[channel].inboxIdentifiers.find(
    (identifier) => identifier.kind === kind,
  )?.strategy
