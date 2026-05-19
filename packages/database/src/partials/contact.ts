import z from "zod"

export const contactSources = z.enum(["imported"])

export const genderTypes = z.enum(["male", "female", "unknown"])
export type GenderType = z.infer<typeof genderTypes>

export const systemFieldTypes = z.enum([
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "user_country",
  "user_state",
  "user_city",
  "inbox_link",
  "gender",
  "locale",
  "locale2",
  "ig_user_name",
  "ig_followers",
  "ig_verified",
  "ig_follow_business",
  "ig_business_follow_user",
  "profile_pic",
  "timezone",
  "timezone_name",
  "user_id",
  "subscribed_date",
  "fb_chat_link",
  "me",
  "user_code",
  "last_btn_title",
  "last_interaction",
  "last_order",
  "last_seen",
  "last_input",
  "last_input_type",
  "consecutive_failed_reply",
  "last_ref",
  "user_channel",
  "user_hash",
  "user_tags",
  "user_external_id",
  "user_source",
  "assigned_admin_name",
  "assigned_admin_email",
  "assigned_admin_id",
  "current_user_time",
  "chat_history",
  "chat_history_large",
  "chat_history_details",
  "chat_history_details_large",
  "user_notes",
  "last_user_note",
  "webchat",
  "webchat_parent_url",
  "avatar",

  "account_id",
  "account_name",
  "account_image",
  "api_key",

  "last_ad",
  "last_ctwa",
  "last_ad_source_url",
  "last_ad_source_platform",

  "last_step",
  "current_step",
  "member_name",
  "team_name",
  "last_input_failure",

  "workspace_id",
  "workspace_name",
  "current_time",
  "page_user_name",
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
  "locale",
])
export type ContactFilterField = z.infer<typeof contactFilterFields>
