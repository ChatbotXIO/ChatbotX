import z from "zod"

export const contactSources = z.enum(["imported"])

export const genderTypes = z.enum(["male", "female", "unknown"])
export type GenderType = z.infer<typeof genderTypes>

export const systemFieldTypes = z.enum([
  "workspace_id",
  "workspace_name",
  "archived",
  "avatar",
  "blocked",
  "contact_created_date_minutes_ago",
  "contact_created_date",
  "continent",
  "conversation_transferred_to_human",
  "country",
  "current_channel",
  "current_time",
  "custom_fields",
  "email",
  "executedFlow",
  "existing_contact",
  "first_name",
  "full_name",
  "gender",
  "interacted_in_last_24h",
  "is_guest_user",
  "language",
  "last_input",
  "last_name",
  "locale",
  "page_user_name",
  "phone_number",
  "source",
  "subscribed_to_broadcast",
  "tags",
  "timezone",
  "user_id",
  "user_tags",
])
export type SystemFieldType = z.infer<typeof systemFieldTypes>

export const reservedCustomFieldNames = z.enum([])
export type ReservedCustomFieldName = z.infer<typeof reservedCustomFieldNames>

export const fillableContactKeys = [
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
  "gender",
] as const
export type FillableContactKey = (typeof fillableContactKeys)[number]

export const contactFilterFields = z.enum([
  "fullName",
  "country",
  "continent",
  "gender",
  "subscribedToBroadcast",
  "contactCreatedAt",
  "contactCreatedDateMinutesAgo",
  "source",
  "conversationTransferredToHuman",
  "interactedInLast24h",
  "archived",
  "blocked",
  "existingContact",
  "currentChannel",
  "email",
  "phone",
  "tags",
  "customFields",
  "executedFlow",
  "language",
])
export type ContactFilterField = z.infer<typeof contactFilterFields>
