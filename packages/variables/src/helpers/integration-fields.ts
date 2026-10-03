import {
  contactInboxService,
  inboxService,
  resolveTenantSettings,
  resolveWorkspaceAppUrl,
} from "@chatbotx.io/business"
import { normalizeStoredTimezone } from "@chatbotx.io/business/contact-locale"
import { systemFieldService } from "@chatbotx.io/business/system-field"
import { resolveIntegrationContextFromContactInbox } from "@chatbotx.io/channel-registry/registry"
import type {
  ChannelType,
  SystemFieldType,
} from "@chatbotx.io/database/partials"
import {
  channelTypes,
  supportsProfileSnapshot,
} from "@chatbotx.io/database/partials"
import type {
  ContactInboxModel,
  ContactModel,
  InboxWithIntegrations,
} from "@chatbotx.io/database/types"
import { signMeLink } from "@chatbotx.io/encryption/link-signature"
import {
  getPostDetails as getInstagramPostDetails,
  type InstagramAuthValue,
} from "@chatbotx.io/integration-instagram"
import {
  getPostDetails as getMessengerPostDetails,
  getUserInboxLink,
  type MessengerAuthValue,
} from "@chatbotx.io/integration-messenger"
import { toLogSafeError } from "@chatbotx.io/logger"
import { withCache } from "@chatbotx.io/redis"
import type { ContactProfileSnapshot } from "@chatbotx.io/sdk"
import { logger } from "../logger"

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
  | "wa_user_id"
  | "wa_user_name"
>

const PROFILE_SNAPSHOT_CACHE_TTL = 300
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

const getStoredProfileSnapshot = (
  contactInbox: ContactInboxModel,
): ContactProfileSnapshot | null => {
  const snapshot: ContactProfileSnapshot = {
    followsBusiness: contactInbox.followsBusiness ?? null,
    businessFollowsContact: contactInbox.businessFollowsContact ?? null,
    accountVerified: contactInbox.accountVerified ?? null,
    followerCount: contactInbox.followerCount ?? null,
    username: contactInbox.sourceUsername ?? null,
  }
  return Object.values(snapshot).every((value) => value === null)
    ? null
    : snapshot
}

/**
 * Live profile snapshot through the channel's own `getProfileSnapshot` handler
 * (the registry picks the right integration, e.g. Instagram vs
 * Instagram-via-Facebook, so no host/type branching lives here). A successful
 * fetch is written through to the contact-inbox columns the contact filter
 * reads; a failed one is never persisted and `withCache` skips null, so the
 * next render retries instead of pinning an empty value.
 */
const resolveLiveProfileSnapshot = (props: {
  contactInbox: ContactInboxModel
  integrationId: string | null
  workspaceId: string
}): Promise<ContactProfileSnapshot | null> => {
  const { contactInbox, integrationId, workspaceId } = props
  return withCache(
    `profile-snapshot:${contactInbox.id}`,
    async () => {
      let snapshot: ContactProfileSnapshot
      try {
        const { integration, ctx } =
          await resolveIntegrationContextFromContactInbox({
            workspaceId,
            contactInbox,
          })
        snapshot = await integration.runChannelHandler(
          "contact",
          "getProfileSnapshot",
          { ctx, data: { sourceId: contactInbox.sourceId } },
        )
      } catch (err) {
        logger.warn(
          {
            err: toLogSafeError(err),
            contactInboxId: contactInbox.id,
            sourceId: contactInbox.sourceId,
          },
          "Contact profile snapshot fetch failed",
        )
        return null
      }

      try {
        await contactInboxService.refreshProfileSnapshot({
          contactInboxId: contactInbox.id,
          inboxId: contactInbox.inboxId,
          snapshot,
        })
      } catch (err) {
        logger.warn(
          { err: toLogSafeError(err), contactInboxId: contactInbox.id },
          "Contact profile snapshot persist failed",
        )
      }
      return snapshot
    },
    {
      ttl: PROFILE_SNAPSHOT_CACHE_TTL,
      tags: integrationId
        ? [`integration:${contactInbox.channel}:${integrationId}`]
        : [],
    },
  )
}

type ProfileSnapshotFieldKey = Extract<
  IntegrationFieldKey,
  | "ig_user_name"
  | "ig_followers"
  | "ig_verified"
  | "ig_follow_business"
  | "ig_business_follow_user"
>

type ProfileSnapshotField = {
  read: (
    snapshot: ContactProfileSnapshot,
  ) => boolean | number | string | null | undefined
  /** Stored value wins and skips the provider call (identity, not a metric). */
  preferStored?: boolean
}

/** One entry per system field, so adding a channel's field is one entry. */
const profileSnapshotFields: Record<
  ProfileSnapshotFieldKey,
  ProfileSnapshotField
> = {
  ig_user_name: { read: (snapshot) => snapshot.username, preferStored: true },
  ig_followers: { read: (snapshot) => snapshot.followerCount },
  ig_verified: { read: (snapshot) => snapshot.accountVerified },
  ig_follow_business: { read: (snapshot) => snapshot.followsBusiness },
  ig_business_follow_user: {
    read: (snapshot) => snapshot.businessFollowsContact,
  },
}

const isProfileSnapshotFieldKey = (
  key: IntegrationFieldKey,
): key is ProfileSnapshotFieldKey => key in profileSnapshotFields

const resolveProfileSnapshotField = async (props: {
  channel: ChannelType
  contactInbox: ContactInboxModel
  inbox: InboxWithIntegrations
  key: ProfileSnapshotFieldKey
}): Promise<string | null> => {
  const { channel, contactInbox, inbox, key } = props
  if (!supportsProfileSnapshot(channel)) {
    return null
  }

  const field = profileSnapshotFields[key]
  const stored = getStoredProfileSnapshot(contactInbox)
  if (field.preferStored && stored) {
    const storedValue = field.read(stored)
    if (storedValue != null) {
      return toStringOrNull(storedValue)
    }
  }

  // Live fetch first; on failure fall back to what the contact-inbox columns
  // captured earlier, so the variable still renders.
  const live = await resolveLiveProfileSnapshot({
    contactInbox,
    integrationId: getChannelIntegrationId(inbox, channel),
    workspaceId: inbox.workspaceId,
  })
  const snapshot = live ?? stored
  return snapshot ? toStringOrNull(field.read(snapshot) ?? null) : null
}

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
    case channelTypes.enum.threads:
      return inbox.integrationThreads?.id ?? null
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
      workspaceId: contact.workspaceId,
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

  if (isProfileSnapshotFieldKey(key)) {
    return await resolveProfileSnapshotField({
      channel,
      contactInbox,
      inbox,
      key,
    })
  }

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
        case channelTypes.enum.threads:
          return inbox.integrationThreads?.name ?? null
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

    case "wa_user_id":
    case "wa_user_name": {
      // Stored at receive time (ContactInbox.sourceUserId/sourceUsername) —
      // Meta offers no BSUID→profile endpoint, so unlike ig_* this resolves
      // from the DB with no extra API call.
      if (!inbox.integrationWhatsapp) {
        return null
      }
      return key === "wa_user_id"
        ? (contactInbox.sourceUserId ?? null)
        : (contactInbox.sourceUsername ?? null)
    }

    default:
      return null
  }
}
