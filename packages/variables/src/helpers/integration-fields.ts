import {
  contactInboxService,
  inboxService,
  resolvePlatformSettings,
} from "@chatbotx.io/business"
import type { SystemFieldType } from "@chatbotx.io/database/partials"
import { channelTypes } from "@chatbotx.io/database/partials"
import type { ContactModel } from "@chatbotx.io/database/types"
import {
  fetchInstagramContactProfile,
  type InstagramAuthValue,
  type InstagramContactProfile,
} from "@chatbotx.io/integration-instagram"
import { withCache } from "@chatbotx.io/redis"

type IntegrationFieldKey = Extract<
  SystemFieldType,
  | "page_user_name"
  | "inbox_link"
  | "ig_user_name"
  | "ig_followers"
  | "ig_verified"
  | "ig_follow_business"
  | "ig_business_follow_user"
  | "timezone_name"
  | "fb_chat_link"
  | "me"
  | "user_code"
  | "webchat"
>

const IG_PROFILE_CACHE_TTL = 300

const EMPTY_IG_PROFILE: InstagramContactProfile = {
  followersCount: null,
  isVerified: null,
  followsBusiness: null,
  businessFollowUser: null,
}

const resolveInstagramContactProfile = (
  contactInboxId: string,
  igsid: string,
  integration: { auth: unknown; id: string },
): Promise<InstagramContactProfile> =>
  withCache(
    `ig-contact-profile:${contactInboxId}`,
    async () => {
      const auth = integration.auth as InstagramAuthValue
      const accessToken = auth?.tokens?.accessToken
      if (!accessToken) {
        return EMPTY_IG_PROFILE
      }

      try {
        return await fetchInstagramContactProfile({
          igsid,
          accessToken,
          version: auth.metadata?.version,
        })
      } catch {
        return EMPTY_IG_PROFILE
      }
    },
    {
      ttl: IG_PROFILE_CACHE_TTL,
      tags: [`integration:instagram:${integration.id}`],
    },
  )

export const getIntegrationField = async (
  contact: ContactModel,
  key: IntegrationFieldKey,
): Promise<string | null> => {
  const contactInbox = await contactInboxService.findRecentByContactId({
    contactId: contact.id,
  })
  if (!contactInbox) {
    return null
  }

  const inbox = await inboxService.findWithIntegrationsById({
    id: contactInbox.inboxId,
  })
  if (!inbox) {
    return null
  }

  const channel =
    contactInbox.channel as (typeof channelTypes.enum)[keyof typeof channelTypes.enum]

  switch (key) {
    case "page_user_name": {
      switch (channel) {
        case channelTypes.enum.instagram:
          return inbox.integrationInstagram?.name ?? null
        case channelTypes.enum.messenger:
          return inbox.integrationMessenger?.name ?? null
        case channelTypes.enum.whatsapp:
          return inbox.integrationWhatsapp?.name ?? null
        case channelTypes.enum.zalo:
          return inbox.integrationZalo?.name ?? null
        case channelTypes.enum.telegram:
          return inbox.integrationTelegram?.name ?? null
        case channelTypes.enum.webchat:
          return inbox.integrationWebchat?.name ?? null
        case channelTypes.enum.smtp:
          return inbox.integrationSmtp?.name ?? null
        default:
          return null
      }
    }

    case "ig_user_name":
      return inbox.integrationInstagram?.username ?? null

    case "fb_chat_link": {
      const pageId = inbox.integrationMessenger?.pageId
      return pageId == null ? null : `https://m.me/${pageId}`
    }

    case "webchat": {
      if (channel !== channelTypes.enum.webchat || !inbox.integrationWebchat) {
        return null
      }
      const { appUrl } = await resolvePlatformSettings({
        workspaceId: contact.workspaceId,
      })
      return `${appUrl}/webchat?webchatId=${inbox.integrationWebchat.id}`
    }

    case "inbox_link": {
      const { appUrl } = await resolvePlatformSettings({
        workspaceId: contact.workspaceId,
      })
      return `${appUrl}/space/${contact.workspaceId}/inbox`
    }

    case "timezone_name":
      return contact.timezone ?? null

    case "me":
    case "user_code":
      return contactInbox.sourceId ?? null

    case "ig_followers":
    case "ig_verified":
    case "ig_follow_business":
    case "ig_business_follow_user": {
      if (!inbox.integrationInstagram) {
        return null
      }
      const profile = await resolveInstagramContactProfile(
        contactInbox.id,
        contactInbox.sourceId,
        inbox.integrationInstagram,
      )
      switch (key) {
        case "ig_followers":
          return profile.followersCount == null
            ? null
            : String(profile.followersCount)
        case "ig_verified":
          return profile.isVerified == null ? null : String(profile.isVerified)
        case "ig_follow_business":
          return profile.followsBusiness == null
            ? null
            : String(profile.followsBusiness)
        default:
          return profile.businessFollowUser == null
            ? null
            : String(profile.businessFollowUser)
      }
    }

    default:
      return null
  }
}
