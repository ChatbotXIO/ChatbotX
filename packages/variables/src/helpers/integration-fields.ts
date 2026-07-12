import {
  contactInboxService,
  inboxService,
  resolveTenantSettings,
  resolveWorkspaceAppUrl,
} from "@chatbotx.io/business"
import { normalizeStoredTimezone } from "@chatbotx.io/business/contact-locale"
import { systemFieldService } from "@chatbotx.io/business/system-field"
import type { SystemFieldType } from "@chatbotx.io/database/partials"
import { channelTypes } from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  InboxWithIntegrations,
} from "@chatbotx.io/database/types"
import { signMeLink } from "@chatbotx.io/encryption/link-signature"
import {
  fetchInstagramContactProfile,
  getPostDetails as getInstagramPostDetails,
  type InstagramAuthValue,
  type InstagramContactProfile,
} from "@chatbotx.io/integration-instagram"
import {
  getPostDetails as getMessengerPostDetails,
  getUserInboxLink,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
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
const FB_CHAT_LINK_CACHE_TTL = 60 * 60
// Short: page owners edit post captions in place, and a stale caption renders
// straight into an outgoing message.
const POST_TEXT_CACHE_TTL = 60

const toStringOrNull = (
  value: boolean | number | string | null,
): string | null => {
  if (value == null) {
    return null
  }
  return String(value)
}

const resolveInstagramContactProfile = (
  contactInboxId: string,
  igsid: string,
  integration: { auth: unknown; id: string },
): Promise<InstagramContactProfile | null> =>
  withCache(
    `ig-contact-profile:${contactInboxId}`,
    async () => {
      const auth = integration.auth as InstagramAuthValue
      const accessToken = auth?.tokens?.accessToken
      if (!accessToken) {
        return null
      }

      try {
        return await fetchInstagramContactProfile({
          igsid,
          accessToken,
          version: auth.metadata?.version,
        })
      } catch {
        return null
      }
    },
    {
      ttl: IG_PROFILE_CACHE_TTL,
      tags: [`integration:instagram:${integration.id}`],
    },
  )

const getCachedPostText = (
  channel: "instagram" | "messenger",
  postId: string,
  resolve: () => Promise<string | null>,
  cacheTags: string[],
): Promise<string | null> =>
  withCache(`post-text:${channel}:${postId}`, resolve, {
    ttl: POST_TEXT_CACHE_TTL,
    tags: cacheTags,
  })

const getCachedFacebookChatLink = (
  pageId: string,
  sourceId: string,
  integration: { auth: unknown; id: string },
): Promise<string | null> =>
  withCache(
    `fb-chat-link:${pageId}:${sourceId}`,
    async () =>
      await getUserInboxLink({
        ctx: {
          auth: integration.auth as MessengerAuthValue,
        },
        input: { userId: sourceId },
      }),
    {
      ttl: FB_CHAT_LINK_CACHE_TTL,
      tags: [`integration:messenger:${integration.id}`],
    },
  )

const getChannelIntegrationId = (
  inbox: InboxWithIntegrations,
  channel: (typeof channelTypes.enum)[keyof typeof channelTypes.enum],
): string | null => {
  switch (channel) {
    case channelTypes.enum.instagram:
      return inbox.integrationInstagram?.id ?? null
    case channelTypes.enum.messenger:
      return inbox.integrationMessenger?.id ?? null
    case channelTypes.enum.whatsapp:
      return inbox.integrationWhatsapp?.id ?? null
    case channelTypes.enum.zalo:
      return inbox.integrationZalo?.id ?? null
    case channelTypes.enum.tiktok:
      return inbox.integrationTiktok?.id ?? null
    case channelTypes.enum.telegram:
      return inbox.integrationTelegram?.id ?? null
    case channelTypes.enum.webchat:
      return inbox.integrationWebchat?.id ?? null
    case channelTypes.enum.smtp:
      return inbox.integrationSmtp?.id ?? null
    default:
      return null
  }
}

export const getLastCommentedPostText = async (
  contactInbox: ContactInboxModel | null | undefined,
  postId: string | null,
): Promise<string | null> => {
  if (!(contactInbox && postId)) {
    return null
  }

  const inbox = await inboxService.findWithIntegrationsById({
    id: contactInbox.inboxId,
  })
  if (!inbox) {
    return null
  }

  if (
    contactInbox.channel === channelTypes.enum.messenger &&
    inbox.integrationMessenger
  ) {
    const integration = inbox.integrationMessenger
    return await getCachedPostText(
      "messenger",
      postId,
      async () => {
        try {
          const post = await getMessengerPostDetails({
            ctx: {
              auth: integration.auth as MessengerAuthValue,
            },
            input: { postId },
          })
          return post.message ?? null
        } catch {
          return null
        }
      },
      [`integration:messenger:${integration.id}`],
    )
  }

  if (
    contactInbox.channel === channelTypes.enum.instagram &&
    inbox.integrationInstagram
  ) {
    const integration = inbox.integrationInstagram
    return await getCachedPostText(
      "instagram",
      postId,
      async () => {
        try {
          const post = await getInstagramPostDetails({
            ctx: {
              auth: integration.auth as InstagramAuthValue,
            },
            input: { postId },
          })
          return post.caption ?? null
        } catch {
          return null
        }
      },
      [`integration:instagram:${integration.id}`],
    )
  }

  return null
}

export const getIntegrationField = async (
  contact: ContactModel,
  key: IntegrationFieldKey,
  contextContactInbox?: ContactInboxModel | null,
  conversationId?: string | null,
): Promise<string | null> => {
  let contactInbox = contextContactInbox
  if (contactInbox == null) {
    contactInbox = await contactInboxService.findRecentByContactId({
      contactId: contact.id,
    })
  }
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
        case channelTypes.enum.tiktok:
          return inbox.integrationTiktok?.name ?? null
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

    case "fb_chat_link": {
      if (
        channel !== channelTypes.enum.messenger ||
        !inbox.integrationMessenger?.pageId
      ) {
        return null
      }

      return await getCachedFacebookChatLink(
        inbox.integrationMessenger.pageId,
        contactInbox.sourceId,
        inbox.integrationMessenger,
      )
    }

    case "webchat": {
      if (channel !== channelTypes.enum.webchat || !inbox.integrationWebchat) {
        return null
      }

      const { appUrl } = await resolveTenantSettings({
        workspaceId: contact.workspaceId,
      })
      return `${appUrl}/webchat?webchatId=${inbox.integrationWebchat.id}`
    }

    case "inbox_link": {
      const { appUrl } = await resolveTenantSettings({
        workspaceId: contact.workspaceId,
      })
      const url = new URL(`/space/${contact.workspaceId}/inbox`, appUrl)
      if (conversationId) {
        url.searchParams.set("conversationId", conversationId)
      }
      return url.toString()
    }

    case "timezone_name":
      if (!contact.timezone) {
        return null
      }
      return normalizeStoredTimezone(contact.timezone) ?? contact.timezone

    case "user_code":
      return contactInbox.sourceId ?? null

    case "me": {
      const integrationId = getChannelIntegrationId(inbox, channel)
      if (!integrationId) {
        return null
      }

      const appUrl = await resolveWorkspaceAppUrl({
        workspaceId: contact.workspaceId,
      })
      const row = await systemFieldService.create({
        type: "me",
        payload: {
          workspaceId: contact.workspaceId,
          channel,
          integrationId,
          sourceId: contactInbox.sourceId,
          contactInboxId: contactInbox.id,
          ...(conversationId ? { conversationId } : {}),
          contactId: contact.id,
        },
      })
      const hash = signMeLink({
        workspaceId: contact.workspaceId,
        sourceId: contactInbox.sourceId,
        integrationId,
        formId: row.id,
      })
      const query = new URLSearchParams({
        w: contact.workspaceId,
        u: contactInbox.sourceId,
        ib: integrationId,
        id: row.id,
        hash,
      })
      return `${appUrl}/extensions/me/?${query.toString()}`
    }

    case "ig_user_name":
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
      if (!profile) {
        return null
      }
      switch (key) {
        case "ig_user_name":
          return profile.username
        case "ig_followers":
          return toStringOrNull(profile.followersCount)
        case "ig_follow_business":
          return toStringOrNull(profile.followsBusiness)
        case "ig_verified":
          return toStringOrNull(profile.isVerified)
        default:
          return toStringOrNull(profile.businessFollowUser)
      }
    }

    default:
      return null
  }
}
