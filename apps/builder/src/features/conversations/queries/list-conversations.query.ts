import {
  type ConversationParticipantPreview,
  conversationService,
  resolveContactAvatarUrl,
  tagService,
} from "@chatbotx.io/business"
import { resolveAdReferral } from "@chatbotx.io/business/ads-conversion/channel-fields"
import { notFoundException } from "@chatbotx.io/business/errors"
import { resolveGoogleAdsClick } from "@chatbotx.io/business/google-ads/click-fields"
import {
  contactInboxOperationalColumns,
  createMessageRepository,
  recentParticipantsRelation,
} from "@chatbotx.io/database/repositories"
import type { ContactTagPreview } from "@chatbotx.io/database/repositories/tag"
import { userColumnsWithoutSecrets } from "@chatbotx.io/database/repositories/user-columns"
import type {
  ContactInboxOperationalModel,
  InboxModel,
} from "@chatbotx.io/database/types"
import { resolveConversationMessagingWindow } from "@chatbotx.io/sdk"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { endOfHour } from "date-fns"
import z from "zod"
import {
  type AvatarFinalizer,
  createAvatarFinalizer,
} from "@/features/contacts/queries/avatar-finalizer"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import { mapConversationParticipants } from "../lib/map-participants"
import { ROW_TAG_PREVIEW_LIMIT } from "../lib/tag-preview"
import type {
  ConversationCompactContactInboxResource,
  ConversationContactInboxResource,
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsCompactResponse,
  ListConversationsResponse,
} from "../schema/resource"
import { buildConversationWhere } from "./build-conversation-where"
import { resolveLastMessageSinceTime } from "./last-message-window"

const DEFAULT_PER_PAGE = 20

// Shared by BOTH conversation query paths (`listConversations` and
// `findConversation`) so a raw `contactInbox.referral` — an arbitrary webhook
// payload — never reaches the oRPC response and both paths produce the exact
// same `conversationContactInboxResource` shape (output validation requires
// this). The explicit projection keeps internal jsonb columns out of the
// response object entirely rather than relying on output validation to strip them.
const resolveContactInboxMessagingWindow = (
  contactInbox: ContactInboxOperationalModel,
  conversationSourceId: string | null,
) =>
  resolveConversationMessagingWindow({
    channel: contactInbox.channel,
    sourceId: conversationSourceId,
    lastIncomingMessageAt: contactInbox.lastIncomingMessageAt,
  })

const mapConversationContactInbox = (
  contactInbox: ContactInboxOperationalModel & { inbox: InboxModel },
  conversationSourceId: string | null,
) => ({
  messagingWindow: resolveContactInboxMessagingWindow(
    contactInbox,
    conversationSourceId,
  ),
  id: contactInbox.id,
  contactId: contactInbox.contactId,
  inboxId: contactInbox.inboxId,
  channel: contactInbox.channel,
  source: contactInbox.source,
  sourceId: contactInbox.sourceId,
  sourceUserId: contactInbox.sourceUserId,
  sourceUsername: contactInbox.sourceUsername,
  followsBusiness: contactInbox.followsBusiness,
  followerCount: contactInbox.followerCount,
  language: contactInbox.language,
  lastMessageAt: contactInbox.lastMessageAt,
  lastIncomingMessageAt: contactInbox.lastIncomingMessageAt,
  contactLastReadAt: contactInbox.contactLastReadAt,
})

const mapConversationContactInboxes = (
  contactInboxes: readonly (ContactInboxOperationalModel & {
    inbox: InboxModel
  })[],
  conversationSourceId: string | null,
): ConversationContactInboxResource[] =>
  contactInboxes.map((contactInbox) => ({
    ...mapConversationContactInbox(contactInbox, conversationSourceId),
    inbox: contactInbox.inbox,
    adReferral: resolveAdReferral(contactInbox.referral),
    googleAdsClick: resolveGoogleAdsClick(contactInbox.referral),
    // Conversation routing (thread control): the composer's standby lock and
    // the owner pill read these off the listed conversation, so the allow-list
    // mapper must carry them or the lock never engages on reload.
    threadControlState: contactInbox.threadControlState,
    threadOwnerRole: contactInbox.threadOwnerRole,
    threadControlUpdatedAt: contactInbox.threadControlUpdatedAt,
    threadOwnerExpiresAt: contactInbox.threadOwnerExpiresAt,
    threadOwnerAppId: contactInbox.threadOwnerAppId,
    threadControlLastEvent: contactInbox.threadControlLastEvent,
  }))

const mapCompactConversationContactInboxes = (
  contactInboxes: readonly (ContactInboxOperationalModel & {
    inbox: InboxModel
  })[],
  conversationSourceId: string | null,
): ConversationCompactContactInboxResource[] =>
  contactInboxes.map((contactInbox) => ({
    ...mapConversationContactInbox(contactInbox, conversationSourceId),
    inbox: {
      id: contactInbox.inbox.id,
      name: contactInbox.inbox.name,
      channel: contactInbox.inbox.channel,
    },
  }))

/** Replaces the raw relation with the public `recentParticipants` shape. */
const withRecentParticipants = <
  T extends { conversationParticipants: ConversationParticipantPreview[] },
>({
  conversationParticipants,
  ...rest
}: T) => ({
  ...rest,
  recentParticipants: mapConversationParticipants(conversationParticipants),
})

type ConversationContactInbox = ContactInboxOperationalModel & {
  inbox: InboxModel
}

const NO_TAGS: ContactTagPreview = { tagCount: 0, tagPreview: [] }

/**
 * The tag preview of every contact on a page, in one batched read (a constant
 * two queries however many rows the page has).
 */
const loadTagPreviews = async (
  workspaceId: string,
  contacts: readonly ({ id: string } | null | undefined)[],
): Promise<Map<string, ContactTagPreview>> => {
  const contactIds = contacts.flatMap((contact) =>
    contact ? [contact.id] : [],
  )
  if (contactIds.length === 0) {
    return new Map()
  }
  return await tagService.listTagPreviewsByContactIds({
    workspaceId,
    contactIds,
    limit: ROW_TAG_PREVIEW_LIMIT,
  })
}

/**
 * Resolves a conversation's contact avatar. One contact often shows up in
 * several conversations of a page (a DM plus its comment threads); the avatar
 * for the same contact and contact inboxes is resolved once and shared, not
 * once per conversation.
 */
const createConversationContactResolver = (
  workspaceId: string,
  finalize: AvatarFinalizer,
  tagPreviews: ReadonlyMap<string, ContactTagPreview>,
) => {
  const avatars = new Map<string, Promise<string | null>>()
  return async <T extends { id: string; avatar: string | null }>(
    contact: T | null,
    contactInboxes: readonly ConversationContactInbox[],
  ): Promise<(T & ContactTagPreview) | null> => {
    if (!contact) {
      return null
    }
    const key = [contact.id, ...contactInboxes.map((ci) => ci.id)].join(":")
    let avatar = avatars.get(key)
    if (!avatar) {
      avatar = resolveContactAvatarUrl(
        { workspaceId, contact, contactInboxes },
        finalize,
      )
      avatars.set(key, avatar)
    }
    return {
      ...contact,
      avatar: await avatar,
      ...(tagPreviews.get(contact.id) ?? NO_TAGS),
    }
  }
}

const conversationCursorSchema = z.object({
  lastActivityAt: z.coerce.date().nullable(),
  id: zodBigintAsString(),
})
type ConversationCursor = z.infer<typeof conversationCursorSchema>

type ListConversationsAccess = {
  includeEmailAndPhone: boolean
  /** Restricts the list to a member's chat scope (mobile API only). */
  scopeWhere?: Record<string, unknown>
  view?: "compact" | "full"
  /** Return contact avatars as absolute URLs (public API) instead of storage
   * keys (builder UI); see `createAvatarFinalizer`. */
  publicUrls?: boolean
}

export function listConversations(
  data: ListConversationsRequest,
  access: ListConversationsAccess & { view: "compact" },
): Promise<ListConversationsCompactResponse>
export function listConversations(
  data: ListConversationsRequest,
  access: ListConversationsAccess & { view?: "full" },
): Promise<ListConversationsResponse>
export async function listConversations(
  data: ListConversationsRequest,
  access: ListConversationsAccess,
): Promise<ListConversationsResponse | ListConversationsCompactResponse> {
  const { workspaceId, ...input } = data

  const limit = input.perPage ?? DEFAULT_PER_PAGE
  const cursor = input.cursor
    ? decodeCursor(input.cursor, conversationCursorSchema)
    : null

  // Inbox keyword search must not become an email/phone oracle for agents who
  // lack the emailAndPhone permission — the caller resolves visibility (from
  // the member's permissions for the private path, or `true` for workspace
  // tokens, which are workspace-level not member-scoped) and threads it through.
  const where = buildConversationWhere(workspaceId, input, cursor, {
    includeEmailAndPhone: access.includeEmailAndPhone,
    scopeWhere: access.scopeWhere,
  })

  const conversations = await conversationService.findManyQuery({
    where,
    orderBy: (table, { sql: orderSql, desc }) => [
      orderSql`${table.lastActivityAt} IS NULL`,
      desc(table.lastActivityAt),
      desc(table.id),
    ],
    limit: limit + 1,
    with: {
      contact: true,
      contactInboxes: {
        columns: contactInboxOperationalColumns,
        with: { inbox: true },
      },
      assignedUser: { columns: userColumnsWithoutSecrets },
      assignedInboxTeam: true,
      conversationParticipants: recentParticipantsRelation,
    },
  })

  const hasMore = conversations.length > limit
  const page = hasMore ? conversations.slice(0, limit) : conversations

  // ── Shard-aware message lookups (parallelized) ──────────────────────────
  const messageRepository = await createMessageRepository()
  // The tag previews are one batched read, independent of the message lookups.
  const [lastMessagesResults, tagPreviews] = await Promise.all([
    Promise.all(
      page.map((c) => {
        // Anchor on this conversation's own lastActivityAt, not a contactInbox's
        // lastMessageAt — a contact's ContactInbox is shared across their DM and
        // every comment-thread conversation, so its lastMessageAt reflects
        // whichever of those was most recently active, not this specific one.
        // Using the wrong (later) anchor excludes this conversation's real last
        // message from the sharded time window, returning an empty preview.
        // Don't bail when lastActivityAt is missing: historical imports populate
        // messages but never set it, so bailing hid the last-message preview.
        // resolveLastMessageSinceTime falls back to a full-history scan instead.
        return messageRepository.findLastByConversation(c.id, {
          attachmentCountOnly: true,
          limit: 1,
          sinceTime: resolveLastMessageSinceTime(c.lastActivityAt),
          workspaceId,
        })
      }),
    ),
    loadTagPreviews(
      workspaceId,
      page.map((c) => c.contact),
    ),
  ])
  const resolveContact = createConversationContactResolver(
    workspaceId,
    createAvatarFinalizer(workspaceId, { publicUrls: access.publicUrls }),
    tagPreviews,
  )

  const lastMessagesByConversationId = new Map(
    page.map((c, index) => [c.id, lastMessagesResults[index]?.[0] ?? null]),
  )

  // ── Build cursor pagination response ────────────────────────────────────
  const lastItem = page.at(-1)
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          lastActivityAt: lastItem.lastActivityAt,
          id: lastItem.id,
        } satisfies ConversationCursor)
      : null

  const prevCursor = cursor
    ? encodeCursor({
        lastActivityAt: page[0]?.lastActivityAt ?? new Date(),
        id: page[0]?.id ?? "0",
      } satisfies ConversationCursor)
    : null

  const pagination = {
    nextCursor,
    prevCursor,
  }
  if (access.view === "compact") {
    return {
      data: await Promise.all(
        page.map(async (c) => {
          const lastMessage = lastMessagesByConversationId.get(c.id)
          return {
            ...withRecentParticipants(c),
            contact: await resolveContact(c.contact ?? null, c.contactInboxes),
            contactInboxes: mapCompactConversationContactInboxes(
              c.contactInboxes,
              c.sourceId,
            ),
            assignedUser: c.assignedUser ?? null,
            assignedInboxTeam: c.assignedInboxTeam ?? null,
            messages: lastMessage ? [lastMessage] : [],
          }
        }),
      ),
      ...pagination,
    }
  }

  return {
    data: await Promise.all(
      page.map(async (c) => {
        const lastMessage = lastMessagesByConversationId.get(c.id)
        return {
          ...withRecentParticipants(c),
          contact: await resolveContact(c.contact ?? null, c.contactInboxes),
          contactInboxes: mapConversationContactInboxes(
            c.contactInboxes,
            c.sourceId,
          ),
          assignedUser: c.assignedUser ?? null,
          assignedInboxTeam: c.assignedInboxTeam ?? null,
          messages: lastMessage ? [lastMessage] : [],
        }
      }),
    ),
    ...pagination,
  }
}

// ── Find single conversation ──────────────────────────────────────────────────

export const findConversation = async (
  input: FindConversationRequest,
  options: { publicUrls?: boolean } = {},
): Promise<FindConversationResponse> => {
  const conversation = await conversationService.findWithFullRelations({
    where: input,
  })
  if (!conversation) {
    throw notFoundException("Conversation not found")
  }

  const messageRepository = await createMessageRepository()
  const [lastMessages, tagPreviews] = await Promise.all([
    messageRepository.findLastByConversation(conversation.id, {
      attachmentCountOnly: true,
      messageTypes: ["incoming", "outgoing"],
      limit: 1,
      // Anchor on this conversation's own lastActivityAt — see the comment in
      // listConversations() above for why contactInbox.lastMessageAt is wrong
      // here (shared across a contact's DM and every comment-thread conversation).
      // Falls back to a full-history scan when lastActivityAt is unset (historical
      // imports), so opening an imported conversation still shows its messages.
      sinceTime: resolveLastMessageSinceTime(
        conversation.lastActivityAt,
        endOfHour,
      ),
      workspaceId: input.workspaceId,
    }),
    loadTagPreviews(input.workspaceId, [conversation.contact]),
  ])

  return {
    data: {
      ...withRecentParticipants(conversation),
      contact: await createConversationContactResolver(
        input.workspaceId,
        createAvatarFinalizer(input.workspaceId, options),
        tagPreviews,
      )(conversation.contact, conversation.contactInboxes),
      contactInboxes: mapConversationContactInboxes(
        conversation.contactInboxes,
        conversation.sourceId,
      ),
      messages: lastMessages.length > 0 ? [lastMessages[0]] : [],
    },
  }
}
