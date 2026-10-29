import z from "zod"

export const contactSources = z.enum([
  "inboundMessage",
  "webchat",
  "ads",
  "botLink",
  "chatPlugin",
  "comments",
  "imported",
  "api",
  "direct",
  "inboundWebhook",
])
export type ContactSource = z.infer<typeof contactSources>

export const profileSnapshotStates = z.enum([
  "pending",
  "captured",
  "unavailable",
  "failed",
])
export type ProfileSnapshotState = z.infer<typeof profileSnapshotStates>

/**
 * Channels whose integration implements `getProfileSnapshot`. The single
 * source for every "can this channel capture a profile snapshot" gate (claim,
 * recovery scans, import producers); adding a channel = add it here and
 * implement the handler.
 */
export const profileSnapshotChannels = ["instagram"] as const
export type ProfileSnapshotChannel = (typeof profileSnapshotChannels)[number]

export const supportsProfileSnapshot = (
  channel: string,
): channel is ProfileSnapshotChannel =>
  profileSnapshotChannels.some((candidate) => candidate === channel)

/**
 * Channels whose integration implements `getPostDetails` and whose comments are
 * tracked per post (`ChannelPost` / `ContactInboxPost`, the `commentedOnPost`
 * filter). The single source for every "can this channel track posts" gate;
 * adding a channel = add it here and implement the handler.
 */
export const postTrackingChannels = ["messenger", "instagram"] as const
export type PostTrackingChannel = (typeof postTrackingChannels)[number]

export const supportsPostTracking = (
  channel: string,
): channel is PostTrackingChannel =>
  postTrackingChannels.some((candidate) => candidate === channel)

export const genderTypes = z.enum(["male", "female", "unknown"])
export type GenderType = z.infer<typeof genderTypes>

/**
 * Bounds the ad ids listed per contact (`{{ad_ids}}`, the contact export): a
 * contact can click far more ads than a message or a CSV cell needs.
 */
export const CONTACT_AD_IDS_LIMIT = 50

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
  "language",
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
  "last_btt_title",
  "empty",
  "last_interaction",
  "last_order",
  "last_opportunity_id",
  "last_seen",
  "last_input",
  "last_input_type",
  "last_text_input",
  "consecutive_failed_reply",
  "last_ref",
  "user_channel",
  "user_hash",
  "minigame_play_token",
  "mini_app_token",
  "shop_token",
  "leaderboard_view_token",
  "referral_name",
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
  "ai.queued.messages",
  "user_notes",
  "last_user_note",
  "webchat",
  "webchat_parent_url",
  "avatar",

  "account_id",
  "account_name",
  "account_image",
  "api_key",
  "page_api_key",

  "last_ad",
  "last_ctwa",
  "ad_ids",
  "ad_id",
  "last_ad_source_url",
  "last_ad_source_platform",
  "last_ad_headline",
  "last_ad_body",
  "last_fb_comment",
  "last_post_id",
  "last_comment_id",
  "last_story_id",
  "total_new_tagged",
  "total_tagged",
  "last_latitude",
  "last_longitude",
  "last_error_log",
  "last_outbound_message_at",
  "last_commented_post_text",
  "last_call_recorded",
  "last_call_transcript",

  "last_step",
  "current_step",
  "booking_id",
  "booking_calendar",
  "booking_date",
  "booking_link",
  "member_name",
  "team_name",
  "admin_name",
  "admin_team_name",
  "last_input_failure",
  "last_points",
  "last_lead_id",
  "last_form_id",
  "last_form_name",
  "last_adgroup_id",

  "workspace_id",
  "workspace_name",
  "current_time",
  "page_user_name",
  "wa_user_id",
  "wa_user_name",
])
export type SystemFieldType = z.infer<typeof systemFieldTypes>

/**
 * System fields that cost a database lookup of their own to resolve. Code that
 * resolves every system field up front (the Execute JavaScript step's `input`)
 * skips them so a step does not pay one query per field on every run; they
 * stay reachable through a `{{key}}` placeholder, which resolves on demand.
 */
export const onDemandSystemFieldTypes: readonly SystemFieldType[] = [
  systemFieldTypes.enum.booking_id,
  systemFieldTypes.enum.last_points,
  systemFieldTypes.enum.last_lead_id,
  systemFieldTypes.enum.last_form_id,
  systemFieldTypes.enum.last_form_name,
  systemFieldTypes.enum.last_adgroup_id,
  systemFieldTypes.enum.ad_ids,
  systemFieldTypes.enum.ad_id,
  systemFieldTypes.enum.admin_name,
  systemFieldTypes.enum.admin_team_name,
  systemFieldTypes.enum.last_text_input,
  systemFieldTypes.enum.page_api_key,
]

export const reservedCustomFieldNames = z.enum([])
export type ReservedCustomFieldName = z.infer<typeof reservedCustomFieldNames>

export const fillableContactKeys = [
  "phoneNumber",
  "email",
  "firstName",
  "lastName",
  "gender",
  "timezone",
] as const
export type FillableContactKey = (typeof fillableContactKeys)[number]

/**
 * The atomic contact-info kinds a contact can hold: exactly one is touched per
 * change, so this is what the `contactInfoUpdated` trigger reports (which info
 * type was updated).
 */
export const contactInfoTypes = z.enum(["phone", "email"])
export type ContactInfoType = z.infer<typeof contactInfoTypes>

/**
 * Selectable values for the `hasContactInfo` filter. Extends the atomic
 * {@link contactInfoTypes} with the `phoneAndEmail` composite so a contact can
 * be required to have BOTH a phone and an email, not just either one.
 */
export const contactInfoFilterValues = z.enum([
  "phone",
  "email",
  "phoneAndEmail",
])
export type ContactInfoFilterValue = z.infer<typeof contactInfoFilterValues>

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
  "followUp",
  "archived",
  "blocked",
  "existingContact",
  "isGuestUser",
  "currentChannel",
  "inbox",
  "subjectToEuRules",
  "timezone",
  "hasOpportunity",
  "hasOpenOpportunity",
  "hasWonOpportunity",
  "hasLostOpportunity",
  "instagramStoryReply",
  "followsBusinessOnInstagram",
  "businessFollowsUserOnInstagram",
  "verifiedAccountOnInstagram",
  "followerCountOnInstagram",
  "lastSent",
  "lastDelivered",
  "lastSeen",
  "lastSeenMinutesAgo",
  "lastInteraction",
  "lastInteractionMinutesAgo",
  "unreplied",
  "unread",
  "appliedJobs",
  "email",
  "phone",
  "hasContactInfo",
  "tags",
  "completedWhatsAppFlows",
  "messengerList",
  "subscribedToDripCampaign",
  "conversationAssigned",
  "entryPointsLinks",
  "sentMessage",
  "keywordsReceived",
  "customFields",
  "customField",
  "botField",
  "executedFlow",
  "executedStep",
  "consecutiveAiFailures",
  "questionnaireStarted",
  "questionnaireInProgress",
  "questionnaireFinished",
  "couponTopic",
  "leaderboardScore",
  "pipelineItem",
  "votedOnPoll",
  "lastComment",
  "commentedOnPost",
  "reactedOnPost",
  "lastTotalTaggedUsers",
  "lastTotalNewTaggedUsers",
  "phoneWasVerified",
  "optedInForSms",
  "broadcastSent",
  "broadcastDelivered",
  "broadcastSeen",
  "broadcastClicked",
  "broadcastFailed",
  "emailWasVerified",
  "optedInForEmail",
  "emailSent",
  "emailDelivered",
  "emailOpened",
  "emailClicked",
  "isWithinWorkingHours",
  "currentDate",
  "currentTime",
  "currentDayOfMonth",
  "currentDayOfWeek",
  "currentMonth",
  "bought",
  "boughtItems",
  "totalSpent",
  "numberOfOrders",
  "shoppingCartTotal",
  "shoppingCartSubtotal",
  "shoppingCartIsEmpty",
  "shoppingCartContainsItems",
  "lastSentMessageFailed",
  "lastUserInput",
  "lastUserInputType",
  "locale",
  "language",
  "fromCtwaAd",
  "fromGoogleAd",
  "clickedAd",
  "ctwaConversion",
  "ctwaRetarget",
])
export type ContactFilterField = z.infer<typeof contactFilterFields>
