import "server-only"

import { zodBigintAsString } from "@chatbotx.io/utils"
import type { ChatStoreInitialState } from "@/features/chat/store/chat-store"
import { INBOX_CONVERSATIONS_PER_PAGE } from "@/features/chat/store/chat-store"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"

const INBOX_SEED_TIMEOUT_MS = 8000
const INBOX_MESSAGES_PER_PAGE = 20

const createSeedTimeout = () => {
  let timeoutId: NodeJS.Timeout | undefined

  return {
    promise: new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error("Inbox initial state seed timed out")),
        INBOX_SEED_TIMEOUT_MS,
      )
    }),
    clear: () => clearTimeout(timeoutId),
  }
}

const seedMessagesState = async (
  workspaceId: string,
  conversationId: string,
): Promise<ChatStoreInitialState> => {
  const { data, nextCursor } =
    await client.messagesAPI.listMessagesAuthenticatedAPI(
      {
        workspaceId,
        perPage: INBOX_MESSAGES_PER_PAGE,
        cursor: "",
        conversationId,
      },
      { signal: AbortSignal.timeout(INBOX_SEED_TIMEOUT_MS) },
    )

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

const mergeSettledState = (
  results: PromiseSettledResult<ChatStoreInitialState>[],
): ChatStoreInitialState =>
  Object.assign(
    {},
    ...results.map((result) =>
      result.status === "fulfilled" ? result.value : {},
    ),
  )

const loadInitialState = async ({
  workspaceId,
  conversationId,
}: {
  workspaceId: string
  conversationId?: string
}): Promise<ChatStoreInitialState | null> => {
  const conversationsPromise =
    client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI(
      {
        workspaceId,
        perPage: INBOX_CONVERSATIONS_PER_PAGE,
        cursor: "",
      },
      { signal: AbortSignal.timeout(INBOX_SEED_TIMEOUT_MS) },
    )

  if (!conversationId) {
    const { data: conversations, nextCursor } = await conversationsPromise
    const activeConversation = conversations[0]

    const state: ChatStoreInitialState = {
      conversations,
      nextCursorConversation: nextCursor,
      isFirstLoadConversation: false,
      activeConversationId: activeConversation?.id ?? null,
      activeConversationAutoSelected: Boolean(activeConversation),
    }

    if (!activeConversation) {
      return state
    }

    const [messages, contact] = await Promise.allSettled([
      seedMessagesState(workspaceId, activeConversation.id),
      seedContactState(workspaceId, activeConversation),
    ])

    return {
      ...state,
      ...mergeSettledState([messages, contact]),
    }
  }

  const findConversationPromise =
    client.conversationsAPI.findConversationAuthenticatedAPI({
      workspaceId,
      id: conversationId,
    })
  const contactPromise = findConversationPromise.then(({ data }) =>
    seedContactState(workspaceId, data),
  )

  const [
    conversationsResult,
    conversationResult,
    messagesResult,
    contactResult,
  ] = await Promise.allSettled([
    conversationsPromise,
    findConversationPromise,
    seedMessagesState(workspaceId, conversationId),
    contactPromise,
  ])

  if (conversationsResult.status === "rejected") {
    return null
  }

  if (conversationResult.status === "rejected") {
    logger.warn(
      { err: conversationResult.reason, workspaceId, conversationId },
      "getInboxInitialState: failed to load deep-linked conversation",
    )
  }

  const listedConversations = conversationsResult.value.data
  const nextCursor = conversationsResult.value.nextCursor
  const activeConversation =
    conversationResult.status === "fulfilled"
      ? conversationResult.value.data
      : null
  const conversations = activeConversation
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
    activeConversationAutoSelected: false,
    ...mergeSettledState(
      activeConversation ? [messagesResult, contactResult] : [],
    ),
  }
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

  const timeout = createSeedTimeout()

  try {
    return await Promise.race([
      loadInitialState({
        workspaceId,
        conversationId: parsedConversationId?.success
          ? parsedConversationId.data
          : undefined,
      }),
      timeout.promise,
    ])
  } catch (err) {
    logger.warn(
      { err, workspaceId, conversationId },
      "getInboxInitialState: failed to seed inbox state",
    )
    return null
  } finally {
    timeout.clear()
  }
}
