"use server"

import { conversationService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { sql } from "@chatbotx.io/database/client"
import { applyContactFilter } from "@chatbotx.io/database/queries"
import {
  createMessageRepository,
  getSafeSinceTime,
} from "@chatbotx.io/database/repositories"
import { parseBigIntId, zodBigintAsString } from "@chatbotx.io/utils"
import { endOfHour } from "date-fns"
import { groupBy } from "remeda"
import z from "zod"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import type {
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsResponse,
} from "../schema/resource"

const DEFAULT_PER_PAGE = 20

const conversationCursorSchema = z.object({
  lastActivityAt: z.coerce.date(),
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

  const where = buildConversationWhere(workspaceId, input, cursor)

  const conversations = await conversationService.findManyQuery({
    where,
    orderBy: {
      lastActivityAt: "desc",
      id: "desc",
    },
    limit: limit + 1,
    with: {
      contact: true,
      contactInboxes: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
  })

  const hasMore = conversations.length > limit
  const page = hasMore ? conversations.slice(0, limit) : conversations

  // ── Shard-aware message lookups (parallelized) ──────────────────────────
  const contactInboxesByContactId = groupBy(
    page.flatMap((c) => c.contactInboxes),
    (ci) => ci.contactId,
  )

  const messageRepository = await createMessageRepository()
  const lastMessagesResults = await Promise.all(
    page.map((c) => {
      const contactInbox = contactInboxesByContactId[c.contactId]?.[0]
      if (!contactInbox?.lastMessageAt) {
        return Promise.resolve([])
      }
      return messageRepository.findLastByConversation(c.id, {
        limit: 1,
        sinceTime: getSafeSinceTime(contactInbox.lastMessageAt),
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

// ── Where builder ─────────────────────────────────────────────────────────────

function buildConversationWhere(
  workspaceId: string,
  input: Omit<ListConversationsRequest, "workspaceId">,
  cursor: ConversationCursor | null,
): Record<string, unknown> {
  const tags = input.tags ?? []
  const isArchiveView = tags.includes("archived")

  const where: Record<string, unknown> = {
    workspaceId,
  }

  if (!isArchiveView) {
    where.archivedAt = { isNull: true }
  }

  if (!tags.includes("blocked")) {
    where.contact = { blockedAt: { isNull: true } }
  }

  // ── Cursor condition ──────────────────────────────────────────────────────
  if (cursor) {
    where.OR = [
      { lastActivityAt: { lt: cursor.lastActivityAt } },
      {
        lastActivityAt: cursor.lastActivityAt,
        id: { lt: cursor.id },
      },
    ]
  }

  // ── botCategory ──────────────────────────────────────────────────────────
  if (input.botCategory) {
    if (input.botCategory === "bot") {
      where.botEnabled = true
    } else if (input.botCategory === "human") {
      where.botEnabled = false
    }
  }

  // ── botEnabled (explicit boolean override) ───────────────────────────────
  if (input.botEnabled !== null && input.botEnabled !== undefined) {
    where.botEnabled = input.botEnabled
  }

  // ── assignedId ───────────────────────────────────────────────────────────
  if (input.assignedId !== null && input.assignedId !== undefined) {
    if (input.assignedId === "unassigned") {
      where.assignedUserId = { isNull: true }
      where.assignedInboxTeamId = { isNull: true }
    } else if (input.assignedId.startsWith("u_")) {
      const userId = parseBigIntId(input.assignedId.slice(2))
      if (userId) {
        where.assignedUserId = userId
      }
    } else if (input.assignedId.startsWith("t_")) {
      const inboxTeamId = parseBigIntId(input.assignedId.slice(2))
      if (inboxTeamId) {
        where.assignedInboxTeamId = inboxTeamId
      }
    }
  }

  // ── channel (via contactInboxes relation) ────────────────────────────────
  if (input.channel) {
    where.contactInboxes = { channel: input.channel }
  }

  // ── keyword (contact firstName / lastName ILIKE) ─────────────────────────
  if (input.keyword) {
    const keyword = input.keyword.toLowerCase()
    where.contact = {
      ...(typeof where.contact === "object" && where.contact !== null
        ? where.contact
        : {}),
      OR: [
        { firstName: { ilike: `%${keyword}%` } },
        { lastName: { ilike: `%${keyword}%` } },
      ],
    }
  }

  // ── tags ──────────────────────────────────────────────────────────────────
  if (tags.includes("noAdminReply")) {
    where.contactRepliedAt = { gt: sql`"adminRepliedAt"` }
  }
  if (tags.includes("unread")) {
    where.lastActivityAt = {
      ...(typeof where.lastActivityAt === "object" &&
      where.lastActivityAt !== null
        ? where.lastActivityAt
        : {}),
      gt: sql`"agentLastReadAt"`,
    }
  }
  if (tags.includes("followUp")) {
    where.followed = true
  }
  if (tags.includes("archived")) {
    where.archivedAt = { isNotNull: true }
  }
  if (tags.includes("blocked")) {
    where.contact = {
      ...(typeof where.contact === "object" && where.contact !== null
        ? where.contact
        : {}),
      blockedAt: { isNotNull: true },
    }
  }

  // ── contactFilter (complex filter builder) ───────────────────────────────
  if (input.contactFilter) {
    const contactFilterWhere = applyContactFilter(input.contactFilter)
    if (Object.keys(contactFilterWhere).length > 0) {
      where.contact = {
        ...(typeof where.contact === "object" && where.contact !== null
          ? where.contact
          : {}),
        ...contactFilterWhere,
      }
    }
  }

  return where
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

  const contactInbox = conversation.contactInboxes?.[0]
  const messageRepository = await createMessageRepository()
  const lastMessages = await messageRepository.findLastByConversation(
    conversation.id,
    {
      messageTypes: ["incoming", "outgoing"],
      limit: 1,
      sinceTime: getSafeSinceTime(
        endOfHour(contactInbox?.lastMessageAt ?? new Date()),
      ),
    },
  )

  return {
    data: {
      ...conversation,
      messages: lastMessages.length > 0 ? [lastMessages[0]] : [],
    },
  }
}
