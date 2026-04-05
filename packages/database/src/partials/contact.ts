import z from "zod"

export const contactSources = z.enum(["imported"])

export const genderTypes = z.enum(["male", "female", "unknown"])
export type GenderType = z.infer<typeof genderTypes>

export const systemFieldTypes = z.enum([
  "language",
  "fullName",
  "country",
  "continent",
  "gender",
  "subscribedToBroadcast",
  "contactCreatedDate",
  "contactCreatedDateMinutesAgo",
  "source",
  "conversationTransferredToHuman",
  "interactedInLast24H",
  "archived",
  "blocked",
  "existingContact",
  "isGuestUser",
  "currentChannel",
  "timezone",
  "tags",
  "customFields",
  "phone",
  "email",
  "executedFlow",
])
export type SystemFieldType = z.infer<typeof systemFieldTypes>

export const reservedCustomFieldNames = z.enum([
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone_number",
  "avatar",
  "locale",
  "gender",
  "timezone",
  "user_id",
  "user_tags",
  "account_name",
  "account_id",
  "page_user_name",
  "last_input",
  "current_time",
])
export type ReservedCustomFieldName = z.infer<typeof reservedCustomFieldNames>

export const fillableContactKeys = [
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
  "gender",
] as const
export type FillableContactKey = (typeof fillableContactKeys)[number]
