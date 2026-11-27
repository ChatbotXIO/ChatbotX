import {
  type ChannelType,
  channelTypes,
  type GenderType,
} from "@chatbotx.io/database/partials"
import type { ContactProfilePatch } from "@chatbotx.io/database/repositories"
import { normalizeGender, normalizeUtcOffset } from "@chatbotx.io/sdk"
import { normalizeContactInboxSourceId } from "../contact/contact-inbox-identity"
import { normalizePhoneToE164 } from "../contact/phone"
import { normalizeEmail } from "../javascript-execution/custom-field-value"
import type { ContactSyncRecord } from "./types"

/** Loaded once per chunk from the workspace; every normalizer reads it. */
export type ContactSyncNormalizeContext = {
  targetCountry: string | null
}

/** Same limits as the create-contact form (`createContactRequest`). */
const NAME_MAX_LENGTH = 100
const EMAIL_MAX_LENGTH = 100
/** Free-text profile columns (ref, locale, country, state, city). */
const TEXT_MAX_LENGTH = 255
const URL_MAX_LENGTH = 2048

const text = (value: string | null): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const limitedText = (value: string | null, maxLength: number) => {
  const trimmed = text(value)
  return trimmed ? trimmed.slice(0, maxLength) : null
}

/** An https URL without credentials, as the browser will load it. */
const httpsUrl = (value: string | null): string | null => {
  const trimmed = text(value)
  if (!trimmed || trimmed.length > URL_MAX_LENGTH) {
    return null
  }
  try {
    const url = new URL(trimmed)
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

const isInRange = (value: number, limit: number) =>
  Number.isFinite(value) && Math.abs(value) <= limit

type ProfileColumn = keyof ContactProfilePatch

type ProfileFieldSpec<Column extends ProfileColumn> = {
  column: Column
  read: (
    record: ContactSyncRecord,
    context: ContactSyncNormalizeContext,
  ) => ContactProfilePatch[Column] | null
}

const profileField = <Column extends ProfileColumn>(
  spec: ProfileFieldSpec<Column>,
) => spec

/**
 * Every `Contact` column a source record can fill, with its normalization —
 * the single table behind creating new contacts and merging existing ones.
 * Identity (`ContactInbox`) data is never here: see `resolveContactSyncIdentity`.
 */
const contactSyncProfileFields = [
  profileField({
    column: "firstName",
    // A record with no split name keeps its full name as the first name.
    read: (record) =>
      limitedText(
        record.firstName ?? (record.lastName ? null : record.fullName),
        NAME_MAX_LENGTH,
      ),
  }),
  profileField({
    column: "lastName",
    read: (record) => limitedText(record.lastName, NAME_MAX_LENGTH),
  }),
  profileField({
    column: "gender",
    read: (record) =>
      (normalizeGender(record.gender ?? undefined) as GenderType | undefined) ??
      null,
  }),
  profileField({
    column: "phoneNumber",
    read: (record, context) => {
      const phone = text(record.phone)
      return phone ? normalizePhoneToE164(phone, context.targetCountry) : null
    },
  }),
  profileField({
    column: "email",
    // Never cut: a shortened address can be another valid address.
    read: (record) => {
      const email = text(record.email)
      return email && email.length <= EMAIL_MAX_LENGTH
        ? normalizeEmail(email)
        : null
    },
  }),
  profileField({
    column: "avatar",
    read: (record) => httpsUrl(record.avatarUrl),
  }),
  profileField({
    column: "locale",
    read: (record) => limitedText(record.locale, TEXT_MAX_LENGTH),
  }),
  profileField({
    column: "timezone",
    read: (record) =>
      normalizeUtcOffset(record.timezoneOffsetHours ?? undefined) ?? null,
  }),
  profileField({
    column: "ref",
    read: (record) => limitedText(record.ref, TEXT_MAX_LENGTH),
  }),
  profileField({
    column: "country",
    read: (record) => limitedText(record.country, TEXT_MAX_LENGTH),
  }),
  profileField({
    column: "state",
    read: (record) => limitedText(record.state, TEXT_MAX_LENGTH),
  }),
  profileField({
    column: "city",
    read: (record) => limitedText(record.city, TEXT_MAX_LENGTH),
  }),
  profileField({
    column: "location",
    read: (record) =>
      record.location &&
      isInRange(record.location.latitude, 90) &&
      isInRange(record.location.longitude, 180)
        ? record.location
        : null,
  }),
]

/** The normalized `Contact` columns of a record; absent values are left out. */
export const buildContactSyncProfile = (
  record: ContactSyncRecord,
  context: ContactSyncNormalizeContext,
): ContactProfilePatch => {
  const patch: Record<string, unknown> = {}
  for (const field of contactSyncProfileFields) {
    const value = field.read(record, context)
    if (value != null) {
      patch[field.column] = value
    }
  }
  return patch as ContactProfilePatch
}

export type ContactSyncIdentity = {
  /** `ContactInbox.sourceId`. */
  sourceId: string
  /** `ContactInbox.sourceUserId`. */
  sourceUserId?: string
}

type IdentityResolver = (
  record: ContactSyncRecord,
  context: ContactSyncNormalizeContext,
) => ContactSyncIdentity | null

/** A channel keys contacts on its user id as the channel sends it. */
const byChannelUserId =
  (channel: ChannelType): IdentityResolver =>
  (record) => {
    const raw = text(record.channelUserId)
    const sourceId = raw ? normalizeContactInboxSourceId(channel, raw) : null
    return sourceId ? { sourceId } : null
  }

const DIGITS_ONLY = /^\d+$/

/** Group chats carry a negative Telegram id and are not contacts. */
const telegramIdentity: IdentityResolver = (record, context) => {
  const identity = byChannelUserId(channelTypes.enum.telegram)(record, context)
  return identity && DIGITS_ONLY.test(identity.sourceId) ? identity : null
}

/** Identity rules per channel a source can import into. */
const IDENTITY_RESOLVERS: Partial<Record<ChannelType, IdentityResolver>> = {
  messenger: byChannelUserId(channelTypes.enum.messenger),
  instagram: byChannelUserId(channelTypes.enum.instagram),
  zalo: byChannelUserId(channelTypes.enum.zalo),
  telegram: telegramIdentity,
}

/** Whether records can be imported into inboxes of `channel` at all. */
export const contactSyncSupportsChannel = (channel: ChannelType): boolean =>
  channel in IDENTITY_RESOLVERS

/** The `ContactInbox` identity of a record on `channel`; `null` = cannot import it. */
export const resolveContactSyncIdentity = (
  record: ContactSyncRecord,
  channel: ChannelType,
  context: ContactSyncNormalizeContext,
): ContactSyncIdentity | null =>
  IDENTITY_RESOLVERS[channel]?.(record, context) ?? null
