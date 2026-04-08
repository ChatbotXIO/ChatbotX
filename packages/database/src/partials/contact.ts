import z from "zod"

export const contactSources = z.enum(["imported"])

export const genderTypes = z.enum(["male", "female", "unknown"])
export type GenderType = z.infer<typeof genderTypes>

export const systemFieldTypes = z.enum([
  "accountId",
  "accountName",
  "archived",
  "avatar",
  "blocked",
  "contactCreatedDate",
  "contactCreatedDateMinutesAgo",
  "continent",
  "conversationTransferredToHuman",
  "country",
  "currentChannel",
  "currentTime",
  "customFields",
  "email",
  "email",
  "executedFlow",
  "existingContact",
  "firstName",
  "firstName",
  "fullName",
  "fullName",
  "gender",
  "gender",
  "interactedInLast24H",
  "isGuestUser",
  "language",
  "lastInput",
  "lastName",
  "locale",
  "pageUserName",
  "phone",
  "phoneNumber",
  "source",
  "subscribedToBroadcast",
  "tags",
  "timezone",
  "timezone",
  "userId",
  "userTags",
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
