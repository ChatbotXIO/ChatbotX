import { contactSyncSourceChannels } from "@chatbotx.io/database/partials"
import { z } from "zod"
import {
  AHACHAT_MAX_CONTACTS_PAGE_SIZE,
  AHACHAT_MAX_LIST_ITEMS,
  AHACHAT_MAX_NAME_LENGTH,
  AHACHAT_MAX_TEXT_LENGTH,
} from "./constants"

const nullableText = z
  .string()
  .max(AHACHAT_MAX_TEXT_LENGTH)
  .nullish()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  })

/** A digits-only id, as AhaChat serialises its 64-bit ids. */
const sourceIdSchema = z.string().regex(/^\d{1,19}$/)

export const ahachatPageSchema = z
  .object({
    id: z.string().trim().min(1),
    channel: contactSyncSourceChannels,
    name: nullableText,
    avatar: nullableText,
    link: nullableText,
    connected_page_id: nullableText,
    latest_user_id: sourceIdSchema.nullish(),
  })
  .transform((page) => ({
    id: page.id,
    channel: page.channel,
    name: page.name,
    avatarUrl: page.avatar,
    link: page.link,
    connectedPageId: page.connected_page_id,
    latestUserId: page.latest_user_id ?? null,
  }))
export type AhachatPage = z.output<typeof ahachatPageSchema>

/** Whether a page exists in AhaChat; names and avatars only, never contact data. */
export const ahachatDiscoveryStatuses = z.enum(["found", "absent", "ambiguous"])
export type AhachatDiscoveryStatus = z.infer<typeof ahachatDiscoveryStatuses>

export const ahachatDiscoveryEntrySchema = z
  .object({
    channel: contactSyncSourceChannels,
    id: z.string().min(1),
    status: ahachatDiscoveryStatuses,
    name: nullableText,
    avatar: nullableText,
  })
  .transform((entry) => ({
    channel: entry.channel,
    id: entry.id,
    status: entry.status,
    name: entry.name,
    avatarUrl: entry.avatar,
  }))
export type AhachatDiscoveryEntry = z.output<typeof ahachatDiscoveryEntrySchema>

export const ahachatTagSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(AHACHAT_MAX_NAME_LENGTH),
})
export type AhachatTag = z.infer<typeof ahachatTagSchema>

export const ahachatFieldTypes = z.enum([
  "text",
  "number",
  "date",
  "datetime",
  "boolean",
  "json",
  "array",
])
export type AhachatFieldType = z.infer<typeof ahachatFieldTypes>

export const ahachatCustomFieldSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(AHACHAT_MAX_NAME_LENGTH),
  type: ahachatFieldTypes,
})
export type AhachatCustomField = z.infer<typeof ahachatCustomFieldSchema>

const contactLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
})

export const ahachatContactSchema = z
  .object({
    id: sourceIdSchema,
    platform_user_id: nullableText,
    whatsapp_user_id: nullableText,
    first_name: nullableText,
    last_name: nullableText,
    full_name: nullableText,
    gender: z.enum(["male", "female"]).nullish(),
    locale: nullableText,
    timezone: z.number().int().nullish(),
    avatar: nullableText,
    phone: nullableText,
    email: nullableText,
    ref: nullableText,
    country: nullableText,
    state: nullableText,
    city: nullableText,
    location: contactLocationSchema.nullish(),
    is_messaging_contact: z.boolean().nullish(),
    created_at: nullableText,
    tags: z.array(ahachatTagSchema).max(AHACHAT_MAX_LIST_ITEMS).default([]),
    custom_fields: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          value: z.union([z.string(), z.boolean()]),
        }),
      )
      .max(AHACHAT_MAX_LIST_ITEMS)
      .default([]),
  })
  .transform((contact) => ({
    id: contact.id,
    platformUserId: contact.platform_user_id,
    whatsappUserId: contact.whatsapp_user_id,
    firstName: contact.first_name,
    lastName: contact.last_name,
    fullName: contact.full_name,
    gender: contact.gender ?? null,
    locale: contact.locale,
    timezoneOffsetHours: contact.timezone ?? null,
    avatarUrl: contact.avatar,
    phone: contact.phone,
    email: contact.email,
    ref: contact.ref,
    country: contact.country,
    state: contact.state,
    city: contact.city,
    location: contact.location ?? null,
    isMessagingContact: contact.is_messaging_contact ?? null,
    createdAt: contact.created_at,
    tags: contact.tags,
    customFields: contact.custom_fields,
  }))
export type AhachatContact = z.output<typeof ahachatContactSchema>

/** The page envelope; items stay unparsed so one bad row cannot fail the page. */
export const ahachatContactsPageSchema = z.object({
  items: z.array(z.unknown()).max(AHACHAT_MAX_CONTACTS_PAGE_SIZE),
  next_cursor: sourceIdSchema.nullish(),
  has_more: z.boolean(),
})

export type AhachatContactsPage = {
  contacts: AhachatContact[]
  /** Rows that did not match the contract; counted as failed by the caller. */
  invalidCount: number
  nextCursor: string | null
  hasMore: boolean
}

/** Every AhaChat response wraps its payload in `{ status_code, message, data }`. */
export const ahachatEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z.object({ data })
