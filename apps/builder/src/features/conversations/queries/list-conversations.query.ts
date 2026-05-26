"use server"

import { conversationService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { db, sql } from "@chatbotx.io/database/client"
import {
  channelTypes,
  conversationBotCategories,
} from "@chatbotx.io/database/partials"
import { getPaginationWithDefaults } from "@chatbotx.io/database/utils"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { applyContactFilter } from "@/features/contacts/apply-contact-filter"
import type { ListConversationsRequest } from "@/features/conversations/schema/query"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import { decodeCursor, encodeCursor } from "@/lib/pagination"
import type {
  FindConversationRequest,
  FindConversationResponse,
  ListConversationsResponse,
} from "../schema/resource"

export const listConversations = async (
  data: ListConversationsRequest,
): Promise<ListConversationsResponse> => {
  const { workspaceId, cursor, ...input } = data
  const pagination = getPaginationWithDefaults(input)

  const where: Record<string, unknown> = {
    workspaceId,
    ...filterByArchiveStatus(data),
    ...filterByConversation(data),
    contact: filterByContact(data),
    contactInboxes: filterByContactInbox(data),
  }

  // Constrói condições OR adicionais (cursor) num AND combinado
  const andConditions: Record<string, unknown>[] = []

  // Handle cursor pagination
  const decodedCursor = cursor
    ? decodeCursor(
        cursor,
        z.object({
          lastActivityAt: z.coerce.date(),
          id: zodBigintAsString(),
        }),
      )
    : null
  const useAsc = data.sortOrder === "asc"
  if (decodedCursor) {
    andConditions.push({
      OR: [
        {
          lastActivityAt: useAsc
            ? { gt: decodedCursor.lastActivityAt }
            : { lt: decodedCursor.lastActivityAt },
        },
        {
          lastActivityAt: { eq: decodedCursor.lastActivityAt },
          id: useAsc ? { lt: decodedCursor.id } : { gt: decodedCursor.id },
        },
      ],
    })
  }

  if (andConditions.length > 0) {
    where.AND = andConditions
  }

  const limit = pagination.limit + 1 // +1 to check if there is a next page
  const direction: "asc" | "desc" = data.sortOrder ?? "desc"
  const conversations = await db.query.conversationModel.findMany({
    with: {
      contact: true,
      contactInboxes: true,
      assignedUser: true,
      assignedInboxTeam: true,
      messages: {
        limit: 1,
        orderBy: { createdAt: "desc" },
      },
    },
    where,
    offset: pagination.offset,
    limit,
    orderBy: {
      lastActivityAt: direction,
      id: direction === "desc" ? "asc" : "desc",
    },
  })

  const hasNext = conversations.length > pagination.limit
  const items = hasNext
    ? conversations.slice(0, pagination.limit)
    : conversations

  // Conta mensagens incoming NÃO LIDAS pelo agente, agrupadas por
  // conversa. Usado pro badge azul do card (igual Respond.io "8" no pill).
  // Lógica mora no conversationService pra evitar quirk Next 16 standalone
  // que reclama de imports de Drizzle models em "use server" files.
  const unreadCountMap = await conversationService.countUnreadByConversationIds(
    { conversationIds: items.map((c) => c.id) },
  )
  const itemsWithUnread = items.map((c) => ({
    ...c,
    unreadCount: unreadCountMap.get(c.id) ?? 0,
  }))

  const nextCursor = hasNext
    ? encodeCursor({
        lastActivityAt: conversations[limit - 2].lastActivityAt.toISOString(),
        id: conversations[limit - 2].id,
      })
    : null

  return {
    data: itemsWithUnread,
    nextCursor,
    prevCursor: null,
  }
}

export const findConversation = async (
  input: FindConversationRequest,
): Promise<FindConversationResponse> => {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const conversation = await db.query.conversationModel.findFirst({
    with: {
      contact: {
        with: {
          contactsOnSequences: {
            with: {
              sequence: true,
            },
          },
          contactNotes: true,
          contactCustomFields: true,
          tags: true,
        },
      },
      contactInboxes: true,
      messages: true,
      assignedUser: true,
      assignedInboxTeam: true,
    },
    where: input,
  })
  if (!conversation) {
    throw notFoundException("Conversa não encontrada")
  }

  const lastMessage = await db.query.messageModel.findFirst({
    where: {
      conversationId: conversation.id,
      messageType: {
        in: ["incoming", "outgoing"],
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return {
    data: {
      ...conversation,
      messages: lastMessage ? [lastMessage] : [],
      // findConversation é chamado quando agente abre a conversa — por
      // definição "marcando como lida". Zero é coerente. O badge azul do
      // card só usa unreadCount na lista (listConversations).
      unreadCount: 0,
    },
  }
}

const filterByArchiveStatus = (
  input: ListConversationsRequest,
): Record<string, unknown> => {
  // Compatibilidade: se tag "archived" foi passada (UI antiga), trata como "closed"
  const effectiveFilter: "open" | "closed" | "all" | undefined =
    input.archiveFilter ??
    (input.tags?.includes("archived") ? "closed" : undefined)

  if (effectiveFilter === "all") {
    return {}
  }
  if (effectiveFilter === "closed") {
    return { archivedAt: { isNotNull: true } }
  }
  // default: open
  return { archivedAt: { isNull: true } }
}

const filterByConversation = (
  input: ListConversationsRequest,
): Record<string, unknown> => {
  const where: Record<string, unknown> = {}

  if (input.botCategory === conversationBotCategories.enum.bot) {
    where.botEnabled = true
  } else if (input.botCategory === conversationBotCategories.enum.human) {
    where.botEnabled = false
  }

  if (input.assignedId) {
    if (input.assignedId === "unassigned") {
      where.assignedUserId = { isNull: true }
      where.assignedInboxTeamId = { isNull: true }
    } else if (input.assignedId.startsWith("u_")) {
      where.assignedUserId = input.assignedId.slice(2)
    } else if (input.assignedId.startsWith("t_")) {
      where.assignedInboxTeamId = input.assignedId.slice(2)
    }
  }

  if (input.tags && input.tags.length > 0) {
    if (input.tags.includes("noAdminReply")) {
      where.adminRepliedAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("unread")) {
      where.agentLastReadAt = { lt: sql`"d0"."contactRepliedAt"` }
    }
    if (input.tags.includes("followUp")) {
      where.followed = true
    }
    // tag "archived" agora é tratado em filterByArchiveStatus pra compatibilidade
  }

  return where
}

const filterByContact = (
  input: ListConversationsRequest,
): Record<string, unknown> | undefined => {
  const where: Record<string, unknown> = {
    blockedAt: { isNull: true },
  }

  if (input.keyword) {
    where.OR = [
      { firstName: { ilike: `%${input.keyword}%` } },
      { lastName: { ilike: `%${input.keyword}%` } },
    ]
  }

  if (input.tags?.includes("blocked")) {
    where.blockedAt = { isNotNull: true }
  }

  if (input.lifecycleStageId) {
    where.lifecycleStageId = input.lifecycleStageId
  }

  if (input.contactFilter) {
    Object.assign(where, applyContactFilter(input.contactFilter))
  }

  if (Object.keys(where).length === 0) {
    return
  }

  return where
}

const filterByContactInbox = (
  input: ListConversationsRequest,
): Record<string, unknown> | undefined => {
  const where: Record<string, unknown> = {}

  if (
    input.channel !== null &&
    input.channel !== undefined &&
    input.channel !== channelTypes.enum.omnichannel
  ) {
    where.channel = input.channel
  }

  if (Object.keys(where).length === 0) {
    return
  }

  return where
}
