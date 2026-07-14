"use server"

import { conversationService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { endOfHour } from "date-fns"
import z from "zod"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import {
  assertCurrentUserCanAccessChatbot,
  getCurrentUserAndTargetWorkspace,
} from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import type {
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsResponse,
} from "../schema/resource"
import { buildConversationWhere } from "./build-conversation-where"
import { resolveLastMessageSinceTime } from "./last-message-window"

const DEFAULT_PER_PAGE = 20

const conversationCursorSchema = z.object({
  lastActivityAt: z.coerce.date().nullable(),
  id: zodBigintAsString(),
})
type ConversationCursor = z.infer<typeof conversationCursorSchema>

export const listConversations = async (
  data: ListConversationsRequest,
): Promise<ListConversationsResponse> => {
  const { workspaceId, ...input } = data
  await assertCurrentUserCanAccessChatbot(workspaceId)

  const limit = input.perPage ?? DEFAULT_PER_PAGE
  const cursor = input.cursor
    ? decodeCursor(input.cursor, conversationCursorSchema)
    : null

  // Inbox keyword search must not become an email/phone oracle for agents who
  // lack the emailAndPhone permission — resolve visibility from the member's
  // permissions (independent of Contacts-section access) and thread it through.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(workspaceId)
  const includeEmailAndPhone = userAndWorkspace
    ? canViewContactEmailAndPhone(
        userAndWorkspace.targetWorkspaceMember.permissions,
      )
    : false

  const where = buildConversationWhere(workspaceId, input, cursor, {
    includeEmailAndPhone,
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
      contactInboxes: { with: { inbox: true } },
      assignedUser: true,
      assignedInboxTeam: true,
    },
  })

  const hasMore = conversations.length > limit
  const page = hasMore ? conversations.slice(0, limit) : conversations

  // ── Shard-aware message lookups (parallelized) ──────────────────────────
  const messageRepository = await createMessageRepository()
  const lastMessagesResults = await Promise.all(
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

  return {
    data: page.map((c) => {
      const lastMessage = lastMessagesByConversationId.get(c.id)
      return {
        ...c,
        contact: c.contact ?? null,
        contactInboxes: c.contactInboxes,
        assignedUser: c.assignedUser ?? null,
        assignedInboxTeam: c.assignedInboxTeam ?? null,
        messages: lastMessage ? [lastMessage] : [],
      }
    }),
    nextCursor,
    prevCursor,
  }
}

// ── Find single conversation ──────────────────────────────────────────────────

export const findConversation = async (
  input: FindConversationRequest,
): Promise<FindConversationResponse> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const conversation = await conversationService.findWithFullRelations({
    where: input,
  })
  if (!conversation) {
    throw notFoundException("Conversation not found")
  }

  const messageRepository = await createMessageRepository()
  const lastMessages = await messageRepository.findLastByConversation(
    conversation.id,
    {
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
    },
  )

  return {
    data: {
      ...conversation,
      messages: lastMessages.length > 0 ? [lastMessages[0]] : [],
    },
  }
}
