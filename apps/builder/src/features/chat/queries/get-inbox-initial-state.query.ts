import "server-only"

import { zodBigintAsString } from "@chatbotx.io/utils"
import type { ChatStoreInitialState } from "@/features/chat/store/chat-store"
import {
  INBOX_CONVERSATIONS_PER_PAGE,
  INBOX_MESSAGES_PER_PAGE,
} from "@/features/chat/store/chat-store"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"

// Balances slow-network tolerance against blocking the page render indefinitely.
const INBOX_SEED_TIMEOUT_MS = 8000

const withTimeout = <T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const seedMessagesState = async (
  workspaceId: string,
  conversationId: string,
): Promise<ChatStoreInitialState> => {
  const { data, nextCursor } =
    await client.messagesAPI.listMessagesAuthenticatedAPI({
      workspaceId,
      perPage: INBOX_MESSAGES_PER_PAGE,
      cursor: "",
      conversationId,
    })

  return {
    messages: [...data].reverse(),
    nextCursorMessage: nextCursor,
    hasNextMessagePage: nextCursor !== null,
    messagesConversationId: conversationId,
  }
}

const seedContactState = async (
  workspaceId: string,
  conversation: ListConversationItemResource,
): Promise<ChatStoreInitialState> => {
  const contactId = conversation.contact?.id
  if (!contactId) {
    return {}
  }

  return {
    seededContact: await client.contactsAPIs.getContactAuthenticatedAPI({
      workspaceId,
      contactId,
    }),
  }
}

const shapeInitialState = ({
  listedConversations,
  nextCursor,
  activeConversation,
  isUrlConversation,
  messagesResult,
  contactResult,
}: {
  listedConversations: ListConversationItemResource[]
  nextCursor: string | null
  activeConversation: ListConversationItemResource | null
  isUrlConversation: boolean
  messagesResult: PromiseSettledResult<ChatStoreInitialState>
  contactResult: PromiseSettledResult<ChatStoreInitialState>
}): ChatStoreInitialState => {
  const conversations =
    isUrlConversation && activeConversation
      ? [
          activeConversation,
          ...listedConversations.filter(
            (conversation) => conversation.id !== activeConversation.id,
          ),
        ]
      : listedConversations

  return {
    conversations,
    nextCursorConversation: nextCursor,
    isFirstLoadConversation: false,
    activeConversationId: activeConversation?.id ?? null,
    activeConversationAutoSelected: isUrlConversation
      ? false
      : Boolean(activeConversation),
    ...(messagesResult.status === "fulfilled" && activeConversation
      ? messagesResult.value
      : {}),
    ...(contactResult.status === "fulfilled" ? contactResult.value : {}),
  }
}

const loadInitialState = async ({
  workspaceId,
  conversationId,
  hasUrlConversationId,
}: {
  workspaceId: string
  conversationId?: string
  hasUrlConversationId: boolean
}): Promise<ChatStoreInitialState | null> => {
  const conversationsPromise =
    client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI({
      workspaceId,
      perPage: INBOX_CONVERSATIONS_PER_PAGE,
      cursor: "",
    })
  const findConversationPromise = conversationId
    ? client.conversationsAPI.findConversationAuthenticatedAPI({
        workspaceId,
        id: conversationId,
      })
    : null
  let messagesPromise: Promise<ChatStoreInitialState | Record<string, never>>
  if (conversationId) {
    messagesPromise = seedMessagesState(workspaceId, conversationId)
  } else if (hasUrlConversationId) {
    messagesPromise = Promise.resolve({})
  } else {
    messagesPromise = conversationsPromise.then(({ data: conversations }) => {
      const activeConversation = conversations[0]
      return activeConversation
        ? seedMessagesState(workspaceId, activeConversation.id)
        : {}
    })
  }

  let contactPromise: Promise<ChatStoreInitialState | Record<string, never>>
  if (findConversationPromise) {
    contactPromise = findConversationPromise
      .then((result) => seedContactState(workspaceId, result.data))
      .catch(() => ({}))
  } else if (hasUrlConversationId) {
    contactPromise = Promise.resolve({})
  } else {
    contactPromise = conversationsPromise
      .then(({ data: conversations }) => {
        const activeConversation = conversations[0]
        return activeConversation
          ? seedContactState(workspaceId, activeConversation)
          : {}
      })
      .catch(() => ({}))
  }

  const [
    conversationsResult,
    conversationResult,
    messagesResult,
    contactResult,
  ] = await Promise.allSettled([
    conversationsPromise,
    findConversationPromise ?? Promise.resolve(null),
    messagesPromise,
    contactPromise,
  ])

  if (conversationsResult.status === "rejected") {
    return null
  }

  const { data: listedConversations, nextCursor } = conversationsResult.value
  let activeConversation: (typeof listedConversations)[number] | null = null
  if (conversationId) {
    activeConversation =
      conversationResult.status === "fulfilled"
        ? (conversationResult.value?.data ?? null)
        : null
  } else {
    activeConversation = hasUrlConversationId
      ? null
      : (listedConversations[0] ?? null)
  }

  return shapeInitialState({
    listedConversations,
    nextCursor,
    activeConversation,
    isUrlConversation: hasUrlConversationId,
    messagesResult,
    contactResult,
  })
}

export const getInboxInitialState = async ({
  workspaceId,
  conversationId,
}: {
  workspaceId: string
  conversationId?: string
}): Promise<ChatStoreInitialState | null> => {
  if (!globalThis.$client) {
    logger.warn(
      { workspaceId, conversationId },
      "getInboxInitialState: server oRPC client is unavailable",
    )
    return null
  }

  const parsedConversationId = conversationId
    ? zodBigintAsString().safeParse(conversationId)
    : null

  try {
    return await withTimeout(
      loadInitialState({
        workspaceId,
        conversationId: parsedConversationId?.success
          ? parsedConversationId.data
          : undefined,
        hasUrlConversationId: Boolean(conversationId),
      }),
      INBOX_SEED_TIMEOUT_MS,
      "Inbox initial state seed timed out",
    )
  } catch (err) {
    logger.warn(
      { err, workspaceId, conversationId },
      "getInboxInitialState: failed to seed inbox state",
    )
    return null
  }
}
