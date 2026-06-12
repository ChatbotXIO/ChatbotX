import { contactInboxService } from "@chatbotx.io/business"
import {
  type SystemFieldType,
  systemFieldTypes,
} from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import { formatInTimeZone } from "date-fns-tz"
import {
  getAssignedAdminEmail,
  getAssignedAdminId,
  getAssignedAdminName,
  getAssignedMemberName,
  getAssignedTeamName,
} from "./helpers/assigned"
import {
  findPrimaryContactChannel,
  getLatestContactNoteString,
  listContactNotesString,
  listContactTagsString,
} from "./helpers/contact"
import { getIntegrationField } from "./helpers/integration-fields"
import {
  getContactLastInput,
  getContactLastInputType,
} from "./helpers/last-input"
import { getChatHistory } from "./helpers/message"
import { toPublicStorageUrl } from "./helpers/storage-url"
import { getWorkspaceImageUrl, getWorkspaceName } from "./helpers/workspace"

const LOCALE_SEPARATOR_RE = /[-_]/

export const extractVariables = (text: string): string[] => {
  const regex = /\{\{(\w+)\}\}/g
  return [...new Set(Array.from(text.matchAll(regex), (match) => match[1]))]
}

export const interpolate = (
  text: string,
  mapping: Record<string, string>,
): string =>
  text.replace(
    /\{\{(\w+)\}\}/g,
    (match, variable) => mapping[variable] ?? match,
  )

const safeFormatInTimeZone = (
  date: Date | string,
  timezone: string | null | undefined,
  pattern: string,
): string => {
  try {
    return formatInTimeZone(date, timezone ?? "UTC", pattern)
  } catch {
    return formatInTimeZone(date, "UTC", pattern)
  }
}

export const getSystemFieldValue = async (
  contact: ContactModel,
  key: SystemFieldType,
): Promise<string | null> => {
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
      return contact.gender
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
      return contact.timezone
    case systemFieldTypes.enum.user_id:
      return contact.id
    case systemFieldTypes.enum.subscribed_date:
      return contact.subscribedAt
        ? safeFormatInTimeZone(
            contact.subscribedAt,
            contact.timezone,
            "yyyy-MM-dd",
          )
        : null
    case systemFieldTypes.enum.last_seen: {
      const lastSeenAt =
        await contactInboxService.findLatestContactLastReadAtByContactId({
          contactId: contact.id,
        })
      return lastSeenAt
        ? safeFormatInTimeZone(
            lastSeenAt,
            contact.timezone,
            "yyyy-MM-dd HH:mm:ss",
          )
        : null
    }
    case systemFieldTypes.enum.last_input:
      return await getContactLastInput(contact.id)
    case systemFieldTypes.enum.last_input_type:
      return await getContactLastInputType(contact.id)
    case systemFieldTypes.enum.user_channel:
      return await findPrimaryContactChannel(contact.id)
    case systemFieldTypes.enum.user_tags:
      return await listContactTagsString(contact.id)
    case systemFieldTypes.enum.user_hash:
      return null
    case systemFieldTypes.enum.workspace_id:
      return contact.workspaceId
    case systemFieldTypes.enum.user_source:
      return null
    case systemFieldTypes.enum.assigned_admin_name:
      return await getAssignedAdminName(contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_email:
      return await getAssignedAdminEmail(contact.workspaceId)
    case systemFieldTypes.enum.assigned_admin_id:
      return await getAssignedAdminId(contact.workspaceId)
    case systemFieldTypes.enum.current_user_time:
      return safeFormatInTimeZone(
        new Date(),
        contact.timezone,
        "yyyy-MM-dd HH:mm:ss",
      )
    case systemFieldTypes.enum.chat_history:
      return await getChatHistory(contact.id, 50)
    case systemFieldTypes.enum.chat_history_large:
      return await getChatHistory(contact.id, 200)
    case systemFieldTypes.enum.chat_history_details:
      return await getChatHistory(contact.id, 50, true)
    case systemFieldTypes.enum.chat_history_details_large:
      return await getChatHistory(contact.id, 200, true)
    case systemFieldTypes.enum.user_notes:
      return await listContactNotesString(contact.id)
    case systemFieldTypes.enum.avatar:
      return await toPublicStorageUrl(contact.avatar, contact.workspaceId)
    case systemFieldTypes.enum.current_time:
      return safeFormatInTimeZone(
        new Date(),
        contact.timezone,
        "yyyy-MM-dd HH:mm:ss",
      )
    case systemFieldTypes.enum.workspace_name:
    case systemFieldTypes.enum.account_name:
      return await getWorkspaceName(contact.workspaceId)
    case systemFieldTypes.enum.account_id:
      return contact.workspaceId
    case systemFieldTypes.enum.account_image:
      return await getWorkspaceImageUrl(contact.workspaceId)
    case systemFieldTypes.enum.page_user_name:
    case systemFieldTypes.enum.inbox_link:
    case systemFieldTypes.enum.ig_user_name:
    case systemFieldTypes.enum.ig_followers:
    case systemFieldTypes.enum.ig_verified:
    case systemFieldTypes.enum.ig_follow_business:
    case systemFieldTypes.enum.ig_business_follow_user:
    case systemFieldTypes.enum.timezone_name:
    case systemFieldTypes.enum.fb_chat_link:
    case systemFieldTypes.enum.me:
    case systemFieldTypes.enum.user_code:
    case systemFieldTypes.enum.webchat:
      return await getIntegrationField(contact, key)
    case systemFieldTypes.enum.last_ref:
      return contact.ref
    case systemFieldTypes.enum.last_interaction: {
      const lastInteractionAt =
        await contactInboxService.findLatestLastIncomingMessageAtByContactId({
          contactId: contact.id,
        })
      return lastInteractionAt
        ? safeFormatInTimeZone(
            lastInteractionAt,
            contact.timezone,
            "yyyy-MM-dd HH:mm:ss",
          )
        : null
    }
    case systemFieldTypes.enum.last_user_note:
      return await getLatestContactNoteString(contact.id)
    case systemFieldTypes.enum.member_name:
      return await getAssignedMemberName(contact.id, contact.workspaceId)
    case systemFieldTypes.enum.team_name:
      return await getAssignedTeamName(contact.id)
    // No upstream tracking yet — intentionally null
    case systemFieldTypes.enum.last_btn_title:
    case systemFieldTypes.enum.last_order:
    case systemFieldTypes.enum.consecutive_failed_reply:
    case systemFieldTypes.enum.user_external_id:
    case systemFieldTypes.enum.webchat_parent_url:
    case systemFieldTypes.enum.api_key:
    case systemFieldTypes.enum.last_ad:
    case systemFieldTypes.enum.last_ctwa:
    case systemFieldTypes.enum.last_ad_source_url:
    case systemFieldTypes.enum.last_ad_source_platform:
    case systemFieldTypes.enum.last_step:
    case systemFieldTypes.enum.current_step:
    case systemFieldTypes.enum.last_input_failure:
      return null
    default: {
      return null
    }
  }
}
