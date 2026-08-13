import {
  appointmentService,
  conversationService,
  messageService,
} from "@chatbotx.io/business"
import {
  languageFromLocale,
  normalizeStoredTimezone,
  offsetFromStoredTimezone,
} from "@chatbotx.io/business/contact-locale"
import { resolveGenderLabel } from "@chatbotx.io/business/system-field"
import { isWorkspaceScheduledForDeletion } from "@chatbotx.io/business/workspace-lifecycle/predicates"
import {
  type ContactSource,
  contactSources,
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type { MessageModel } from "@chatbotx.io/database/types"
import { signUserHash } from "@chatbotx.io/encryption/user-hash"
import {
  DATE_FORMAT,
  DATE_TIME_FORMAT,
  DEFAULT_FILTER_TIMEZONE,
  formatCustomFieldValueInTimeZone,
  formatWithFallback,
} from "@chatbotx.io/utils/datetime"
import {
  getAssignedTeamName,
  resolveAssigneeEmail,
  resolveAssigneeId,
  resolveAssigneeName,
} from "./helpers/assigned"
import {
  findPrimaryContactChannel,
  getLatestContactNoteString,
  listContactNotesString,
  listContactTagsString,
} from "./helpers/contact"
import {
  getIntegrationField,
  getLastCommentedPostText,
} from "./helpers/integration-fields"
import {
  getContactLastInput,
  getContactLastInputType,
} from "./helpers/last-input"
import { getChatHistory } from "./helpers/message"
import { getQueuedMessages } from "./helpers/queued-messages"
import { toPublicStorageUrl } from "./helpers/storage-url"
import { logger } from "./logger"
import type { ContactVariableContext } from "./schema"

const LOCALE_SEPARATOR_RE = /[-_]/
const VARIABLE_PLACEHOLDER_REGEX =
  /\{\{([\w.]+|coupon:[^{}\n]+|raw:[^{}\n]+)\}\}/g
// `{{gender}}` renders a salutation ("Anh" / "anh"), so its case depends on
// where the placeholder sits — a call the position-independent mapping can't
// make. resolveGenderLabel returns the opening form; inside a sentence it is
// that label lowercased.
const SENTENCE_CASED_VARIABLES = new Set<string>([systemFieldTypes.enum.gender])

// The text before a placeholder that opens the message, a line, or a sentence.
const SENTENCE_OPENING_RE = /(?:^|[.!?…\n\r])[\s"'“‘([]*$/

const contactSourceLabels: Record<ContactSource, string> = {
  [contactSources.enum.inboundMessage]: "Inbound Message",
  [contactSources.enum.webchat]: "Webchat",
  [contactSources.enum.ads]: "Ads",
  [contactSources.enum.botLink]: "Bot Link",
  [contactSources.enum.chatPlugin]: "Chat Plugin",
  [contactSources.enum.comments]: "Facebook/IG Comment",
  [contactSources.enum.imported]: "Imported",
  [contactSources.enum.api]: "API",
  [contactSources.enum.direct]: "Direct",
}

const formatContactSource = (source: string | null | undefined): string => {
  if (!source) {
    return "Unknown"
  }
  const parsedSource = contactSources.safeParse(source)
  if (!parsedSource.success) {
    return source
  }
  return contactSourceLabels[parsedSource.data]
}

const capitalizeFirstLetter = (value: string | null): string | null => {
  if (!value) {
    return value
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export type InterpolateOptions = {
  /** Case `{{gender}}` by position. Prose wants it; URLs and JSON must not. */
  sentenceCase?: boolean
}

export const extractVariables = (text: string): string[] => [
  ...new Set(
    Array.from(text.matchAll(VARIABLE_PLACEHOLDER_REGEX), (match) =>
      match[1].trim(),
    ),
  ),
]

export const interpolate = (
  text: string,
  mapping: Record<string, string>,
  options: InterpolateOptions = {},
): string =>
  text.replace(
    VARIABLE_PLACEHOLDER_REGEX,
    (match, variable: string, offset: number) => {
      const key = variable.trim()
      const value = mapping[key]
      if (value === undefined) {
        return match
      }
      if (!(options.sentenceCase && SENTENCE_CASED_VARIABLES.has(key))) {
        return value
      }
      return SENTENCE_OPENING_RE.test(text.slice(0, offset))
        ? value
        : value.toLowerCase()
    },
  )

const getTimezone = ({
  contact,
  workspace,
}: ContactVariableContext): string | null =>
  workspace?.timezone ?? normalizeStoredTimezone(contact.timezone)

export const getContactTimezone = ({
  contact,
  workspace,
}: ContactVariableContext): string | null =>
  normalizeStoredTimezone(contact.timezone) ??
  workspace?.timezone ??
  DEFAULT_FILTER_TIMEZONE

const formatDate = (
  date: Date | string | null | undefined,
  timezone: string | null,
): string | null => {
  if (!date) {
    return null
  }

  return formatWithFallback(date, timezone, DATE_FORMAT)
}

const formatDateTime = (
  date: Date | string | null | undefined,
  timezone: string | null,
): string | null => {
  if (!date) {
    return null
  }

  return formatWithFallback(date, timezone, DATE_TIME_FORMAT)
}

export const renderCustomFieldValue = (
  type: string,
  value: string | null | undefined,
  timezone: string | null | undefined,
): string =>
  formatCustomFieldValueInTimeZone(
    type,
    value,
    timezone ?? DEFAULT_FILTER_TIMEZONE,
  )

const getWorkspaceLogo = ({
  workspace,
}: ContactVariableContext): string | null => {
  if (!workspace?.logo) {
    return null
  }

  return workspace.logo
}

const getContactLocationValue = (
  contact: ContactVariableContext["contact"],
  key: "latitude" | "longitude",
): string | null => {
  const value = contact.location?.[key]
  return typeof value === "number" ? String(value) : null
}

const getReferralValue = (
  contactInbox: ContactVariableContext["contactInbox"],
  key: "adId" | "adTitle" | "ctwaClid" | "sourceUrl" | "sourcePlatform",
): string | null => {
  const value = contactInbox?.referral?.[key]
  return typeof value === "string" && value.length > 0 ? value : null
}

const getFlowStepValue = async (
  context: ContactVariableContext,
  key: "lastStep" | "currentStep",
): Promise<string | null> => {
  const conversation = await conversationService.findDMByContact({
    workspaceId: context.contact.workspaceId,
    contactId: context.contact.id,
  })
  return conversation?.[key] ?? null
}

// The user's own last comment is stored as a pointer to the exact Message row.
// `createdAt` is part of the lookup because Message is time-partitioned.
const getLastUserComment = async (
  context: ContactVariableContext,
): Promise<MessageModel | null> => {
  const { contact, contactInbox } = context
  if (
    !(contactInbox?.lastCommentMessageId && contactInbox.lastCommentMessageAt)
  ) {
    return null
  }

  const message = await messageService.findById({
    id: contactInbox.lastCommentMessageId,
    createdAt: contactInbox.lastCommentMessageAt,
    workspaceId: contact.workspaceId,
  })
  if (!message || message.deletedAt) {
    return null
  }

  return message
}

const getCommentMessagePostId = (
  message: MessageModel | null,
): string | null => {
  const postId = message?.contentAttributes?.postId
  return typeof postId === "string" ? postId : null
}

// The contact's own language, in the order the platform learns it: the channel
// language we recorded, then the locale their profile reports. Undefined when
// the contact never told us, so the caller picks the fallback. Blank values
// normalise away here rather than shadowing that fallback.
const getContactLanguage = (
  context: ContactVariableContext,
): string | undefined =>
  languageFromLocale(context.contactInbox?.language) ??
  languageFromLocale(context.contact.locale)

const getAppointment = async (
  context: ContactVariableContext,
): Promise<Awaited<ReturnType<typeof appointmentService.findBy>> | null> => {
  if (!context.appointmentId) {
    logger.debug(
      {
        workspaceId: context.contact.workspaceId,
        contactId: context.contact.id,
      },
      "Appointment variable skipped without explicit appointment context",
    )
    return null
  }

  const appointment = await appointmentService.findBy({
    workspaceId: context.contact.workspaceId,
    id: context.appointmentId,
  })

  if (!appointment || appointment.contactId !== context.contact.id) {
    return null
  }

  return appointment
}

export const getSystemFieldValue = async (
  context: ContactVariableContext,
  key: SystemFieldType,
): Promise<string | null> => {
  const { contact, contactInbox, workspace } = context
  const timezone = getTimezone(context)
  // Timestamps tied to a specific contact (when they subscribed, were last seen)
  // read in the contact's own timezone, falling back to the workspace timezone
  // (then UTC). `timezone` above stays workspace-first for workspace-scoped
  // values like current_time. See getContactTimezone.
  const contactTimezone = getContactTimezone(context)

  switch (key) {
    case systemFieldTypes.enum.email:
      return contact.email
    case systemFieldTypes.enum.phone:
      return contact.phoneNumber
    case systemFieldTypes.enum.first_name:
      return contact.firstName
    case systemFieldTypes.enum.last_name:
      return contact.lastName
    case systemFieldTypes.enum.full_name:
      return [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    case systemFieldTypes.enum.profile_pic:
      return await toPublicStorageUrl(contact.avatar, contact.workspaceId)
    case systemFieldTypes.enum.gender:
      return resolveGenderLabel(
        getContactLanguage(context) ?? workspace?.language,
        contact.gender,
      )
    case systemFieldTypes.enum.user_country:
      return contact.country
    case systemFieldTypes.enum.user_state:
      return contact.state
    case systemFieldTypes.enum.user_city:
      return contact.city
    case systemFieldTypes.enum.locale:
      return contact.locale
    case systemFieldTypes.enum.locale2:
      return contact.locale?.split(LOCALE_SEPARATOR_RE)[0] ?? null
    case systemFieldTypes.enum.timezone:
      return offsetFromStoredTimezone(contact.timezone)
    case systemFieldTypes.enum.language:
      return (
        contactInbox?.language ?? languageFromLocale(contact.locale) ?? null
      )
    case systemFieldTypes.enum.user_id:
      return contactInbox?.sourceId ?? null
    case systemFieldTypes.enum.subscribed_date:
      return formatDate(contactInbox?.createdAt, contactTimezone)
    case systemFieldTypes.enum.last_seen:
      return formatDateTime(contactInbox?.contactLastReadAt, contactTimezone)
    case systemFieldTypes.enum.last_input:
      return await getContactLastInput(contact.id)
    case systemFieldTypes.enum.last_input_type:
      return await getContactLastInputType(contact.id)
    case systemFieldTypes.enum.user_channel:
      return capitalizeFirstLetter(
        contactInbox?.channel ?? (await findPrimaryContactChannel(contact.id)),
      )
    case systemFieldTypes.enum.user_tags:
      return await listContactTagsString(contact.id)
    case systemFieldTypes.enum.user_hash: {
      if (!contactInbox) {
        return null
      }
      return await signUserHash({
        sourceId: contactInbox.sourceId,
        contactInboxId: contactInbox.id,
      })
    }
    case systemFieldTypes.enum.workspace_id:
      return contact.workspaceId
    case systemFieldTypes.enum.user_source:
      return formatContactSource(contactInbox?.source)
    case systemFieldTypes.enum.assigned_admin_name:
      return await resolveAssigneeName(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_email:
      return await resolveAssigneeEmail(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_id:
      return await resolveAssigneeId(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.current_user_time:
      return formatWithFallback(
        new Date(),
        getContactTimezone(context),
        DATE_TIME_FORMAT,
      )
    case systemFieldTypes.enum.chat_history:
      return await getChatHistory(contact.id, 50)
    case systemFieldTypes.enum.chat_history_large:
      return await getChatHistory(contact.id, 200)
    case systemFieldTypes.enum.chat_history_details:
      return await getChatHistory(contact.id, 50, true)
    case systemFieldTypes.enum.chat_history_details_large:
      return await getChatHistory(contact.id, 200, true)
    case systemFieldTypes.enum["ai.queued.messages"]:
      return await getQueuedMessages(context)
    case systemFieldTypes.enum.user_notes:
      return await listContactNotesString(contact.id)
    case systemFieldTypes.enum.avatar:
      return await toPublicStorageUrl(contact.avatar, contact.workspaceId)
    case systemFieldTypes.enum.current_time:
      return formatWithFallback(new Date(), timezone, DATE_TIME_FORMAT)
    case systemFieldTypes.enum.workspace_name:
    case systemFieldTypes.enum.account_name:
      return workspace?.name ?? null
    case systemFieldTypes.enum.account_id:
      return contact.workspaceId
    case systemFieldTypes.enum.account_image:
      return await toPublicStorageUrl(
        getWorkspaceLogo(context),
        contact.workspaceId,
      )
    case systemFieldTypes.enum.page_user_name:
    case systemFieldTypes.enum.inbox_link:
    case systemFieldTypes.enum.ig_user_name:
    case systemFieldTypes.enum.ig_followers:
    case systemFieldTypes.enum.ig_verified:
    case systemFieldTypes.enum.ig_follow_business:
    case systemFieldTypes.enum.ig_business_follow_user:
    case systemFieldTypes.enum.timezone_name:
    case systemFieldTypes.enum.fb_chat_link:
    case systemFieldTypes.enum.user_code:
    case systemFieldTypes.enum.webchat:
      return await getIntegrationField(
        contact,
        key,
        contactInbox,
        context.conversation?.id,
      )
    case systemFieldTypes.enum.me:
      if (workspace && isWorkspaceScheduledForDeletion(workspace)) {
        return null
      }
      return await getIntegrationField(
        contact,
        key,
        contactInbox,
        context.conversation?.id,
      )
    case systemFieldTypes.enum.last_ref:
      return contact.ref ?? contactInbox?.referral?.ref ?? null
    case systemFieldTypes.enum.last_interaction:
      return formatDateTime(contactInbox?.lastIncomingMessageAt, timezone)
    case systemFieldTypes.enum.last_user_note:
      return await getLatestContactNoteString(contact.id)
    case systemFieldTypes.enum.member_name:
      return await resolveAssigneeName(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.team_name:
      return await getAssignedTeamName(contact.id)
    // No upstream tracking yet — intentionally null
    case systemFieldTypes.enum.last_order:
      return null
    case systemFieldTypes.enum.last_btn_title:
      return contactInbox?.lastBtnTitle ?? null
    case systemFieldTypes.enum.consecutive_failed_reply:
      return contactInbox
        ? String(contactInbox.consecutiveFailedReply ?? 0)
        : null
    case systemFieldTypes.enum.user_external_id:
      return contactInbox?.sourceId ?? null
    case systemFieldTypes.enum.webchat_parent_url:
      return contactInbox?.webchatParentUrl ?? null
    case systemFieldTypes.enum.api_key:
      return workspace?.token ?? null
    case systemFieldTypes.enum.last_ad:
      return getReferralValue(contactInbox, "adId")
    case systemFieldTypes.enum.last_ctwa:
      return getReferralValue(contactInbox, "ctwaClid")
    case systemFieldTypes.enum.last_ad_source_url:
      return getReferralValue(contactInbox, "sourceUrl")
    case systemFieldTypes.enum.last_ad_source_platform:
      return getReferralValue(contactInbox, "sourcePlatform")
    case systemFieldTypes.enum.last_fb_comment:
      return (await getLastUserComment(context))?.text ?? null
    case systemFieldTypes.enum.last_post_id: {
      const message = await getLastUserComment(context)
      return getCommentMessagePostId(message)
    }
    case systemFieldTypes.enum.last_comment_id:
      return (await getLastUserComment(context))?.sourceId ?? null
    case systemFieldTypes.enum.total_new_tagged:
      return null
    case systemFieldTypes.enum.total_tagged:
      return null
    case systemFieldTypes.enum.last_latitude:
      return getContactLocationValue(contact, "latitude")
    case systemFieldTypes.enum.last_longitude:
      return getContactLocationValue(contact, "longitude")
    case systemFieldTypes.enum.last_error_log:
      return contactInbox?.lastErrorLog ?? null
    case systemFieldTypes.enum.last_outbound_message_at:
      return formatDateTime(contactInbox?.lastOutboundMessageAt, timezone)
    case systemFieldTypes.enum.last_commented_post_text: {
      const message = await getLastUserComment(context)
      const postId = getCommentMessagePostId(message)
      return await getLastCommentedPostText(contactInbox, postId)
    }
    case systemFieldTypes.enum.last_step:
      return await getFlowStepValue(context, "lastStep")
    case systemFieldTypes.enum.current_step:
      return await getFlowStepValue(context, "currentStep")
    case systemFieldTypes.enum.booking_calendar:
      return (await getAppointment(context))?.calendar.name ?? null
    case systemFieldTypes.enum.booking_date: {
      const appointment = await getAppointment(context)
      return formatDateTime(
        appointment?.startAt,
        appointment?.inviteeTimezone ?? contactTimezone,
      )
    }
    case systemFieldTypes.enum.last_input_failure:
      return contactInbox?.lastInputFailure ?? null
    default: {
      // Adding a systemFieldTypes value without a case above fails to compile
      // here. If one ever reaches runtime it must not take a message down, so
      // it degrades to null (an empty substitution) and reports itself.
      const unhandled: never = key
      logger.error(`Unhandled system field: ${String(unhandled)}`)
      return null
    }
  }
}
