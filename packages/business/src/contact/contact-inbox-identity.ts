import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { createId } from "@chatbotx.io/utils"
import {
  CONTACT_LOOKUP_ORDER,
  type ContactIdentityKind,
} from "@chatbotx.io/utils/inbound-webhook-channel"
import { randomString } from "remeda"

/** What a caller knows about a contact; each channel picks the identity it keys on. */
export type ContactInboxIdentities = {
  channelUserId?: string
  /** E.164, with the leading `+`. */
  phoneE164?: string
  email?: string
  /** Matches an existing contact only; no channel addresses a contact by name. */
  fullName?: string
}

/** Which `ContactInboxIdentities` field carries each identity kind. */
export const IDENTITY_FIELD: Record<
  ContactIdentityKind,
  keyof ContactInboxIdentities
> = {
  channelUserId: "channelUserId",
  phone: "phoneE164",
  email: "email",
  fullName: "fullName",
}

export const identityValue = (
  identities: ContactInboxIdentities,
  kind: ContactIdentityKind,
): string | undefined => identities[IDENTITY_FIELD[kind]]

/** The one identity a contact is searched by. */
export type ContactLookupKey = { kind: ContactIdentityKind; value: string }

const NON_DIGITS_PATTERN = /\D/g

const asSent = (raw: string): string | null => raw

/**
 * How a channel writes a contact's external id into `ContactInbox.sourceId`,
 * given the id as a sender spells it. The one set of rules behind both creating
 * a contact and finding one, so the two cannot disagree. Exhaustive on purpose.
 */
const SOURCE_ID_NORMALIZER: Record<
  ChannelType,
  (raw: string) => string | null
> = {
  // `wa_id` is the E.164 digits without the "+".
  whatsapp: (raw) => raw.replace(NON_DIGITS_PATTERN, "") || null,
  // Threads contacts are keyed by the commenter's lower-cased username.
  threads: (raw) => raw.toLowerCase(),
  omnichannel: () => null,
  smtp: asSent,
  // Webchat ids are minted when the contact is created; a sender can still
  // quote one back to find that contact.
  webchat: asSent,
  messenger: asSent,
  instagram: asSent,
  telegram: asSent,
  zalo: asSent,
  tiktok: asSent,
  api: asSent,
}

export const normalizeContactInboxSourceId = (
  channel: ChannelType,
  raw: string,
): string | null => SOURCE_ID_NORMALIZER[channel](raw)

/**
 * The identity a contact is searched by: the first kind in lookup order that
 * the payload supplied and the channel can use. Only that one is queried — a
 * miss never falls through to the next, because a looser key could match
 * someone else on the same inbox. A channel user id the channel cannot turn
 * into a source id (omnichannel, a WhatsApp value without digits) is no key at
 * all, so it is skipped like an absent value. With no `channel` (a preview
 * before the inbox is known) every supplied identity counts.
 */
export const selectContactLookup = (
  identities: ContactInboxIdentities,
  channel: ChannelType | null = null,
): ContactLookupKey | null => {
  for (const kind of CONTACT_LOOKUP_ORDER) {
    const value = identityValue(identities, kind)
    const isUsable =
      kind !== "channelUserId" ||
      channel === null ||
      normalizeContactInboxSourceId(channel, value ?? "") !== null
    if (value && isUsable) {
      return { kind, value }
    }
  }
  return null
}

const fromChannelUserId =
  (channel: ChannelType) =>
  ({ channelUserId }: ContactInboxIdentities) =>
    channelUserId === undefined
      ? null
      : normalizeContactInboxSourceId(channel, channelUserId)

/**
 * The deterministic `ContactInbox.sourceId` a channel keys its contacts on, or
 * `null` when the identities do not carry one (or the channel mints its own).
 * Exhaustive on purpose: a new channel fails to compile until it declares how
 * its contacts are addressed — the single answer shared by contact creation and
 * by lookups of an existing contact.
 */
const DERIVED_SOURCE_ID: Record<
  ChannelType,
  (identities: ContactInboxIdentities) => string | null
> = {
  whatsapp: ({ phoneE164 }) =>
    phoneE164 ? normalizeContactInboxSourceId("whatsapp", phoneE164) : null,
  smtp: ({ email }) =>
    email ? normalizeContactInboxSourceId("smtp", email) : null,
  // Webchat visitors have no external id: the source id is minted.
  webchat: () => null,
  omnichannel: () => null,
  messenger: fromChannelUserId("messenger"),
  instagram: fromChannelUserId("instagram"),
  telegram: fromChannelUserId("telegram"),
  zalo: fromChannelUserId("zalo"),
  tiktok: fromChannelUserId("tiktok"),
  threads: fromChannelUserId("threads"),
  api: fromChannelUserId("api"),
}

/** Channels whose contacts get a freshly minted source id (no external identity). */
const MINTED_SOURCE_ID_CHANNELS: ReadonlySet<ChannelType> = new Set([
  channelTypes.enum.webchat,
])

export const deriveContactInboxSourceId = (
  channel: ChannelType,
  identities: ContactInboxIdentities,
): string | null => DERIVED_SOURCE_ID[channel](identities)

/** The source id for a contact about to be created on `channel`. */
export const resolveNewContactInboxSourceId = (
  channel: ChannelType,
  identities: ContactInboxIdentities,
): string => {
  const derived = deriveContactInboxSourceId(channel, identities)
  if (derived !== null) {
    return derived
  }
  return MINTED_SOURCE_ID_CHANNELS.has(channel)
    ? `${randomString(10)}${createId()}`
    : ""
}
