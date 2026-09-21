import "server-only"

import { zodBigintAsString } from "@chatbotx.io/utils"
import type {
  ChatStoreInitialState,
  ChatStoreMessagesSeed,
} from "@/features/chat/store/chat-store"
import {
  INBOX_CONVERSATIONS_PER_PAGE,
  INBOX_MESSAGES_PER_PAGE,
} from "@/features/chat/store/chat-store"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"

// Balances slow-network tolerance against blocking the page render indefinitely.
const INBOX_SEED_TIMEOUT_MS = 8000

/**
 * The three states a URL `conversationId` query param can be in. Kept as a
 * union — rather than the `conversationId?: string` + `hasUrlConversationId:
 * boolean` pair this replaces — because that pair could represent a fourth,
 * impossible combination (`hasUrlConversationId: false` with a `conversationId`
 * set): the seed would then seed messages/contact for that id but mark
 * `activeConversationAutoSelected: true` as if no deep link had been
 * requested, mislabeling a genuine deep link as an auto-selection.
 */
type UrlConversation =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "valid"; id: string }

const parseUrlConversation = (conversationId?: string): UrlConversation => {
  if (!conversationId) {
    return { kind: "none" }
  }
  const parsed = zodBigintAsString().safeParse(conversationId)
  return parsed.success
    ? { kind: "valid", id: parsed.data }
    : { kind: "invalid" }
}

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
): Promise<Pick<ChatStoreInitialState, "messagesSeed">> => {
  const { data, nextCursor } =
    await client.messagesAPI.listMessagesAuthenticatedAPI({
      workspaceId,
      perPage: INBOX_MESSAGES_PER_PAGE,
      cursor: "",
      conversationId,
    })

  const messagesSeed: ChatStoreMessagesSeed = {
    messages: [...data].reverse(),
    nextCursorMessage: nextCursor,
    hasNextMessagePage: nextCursor !== null,
    messagesConversationId: conversationId,
  }

  return { messagesSeed }
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
  urlConversation,
  messagesResult,
  contactResult,
}: {
  listedConversations: ListConversationItemResource[]
  nextCursor: string | null
  activeConversation: ListConversationItemResource | null
  urlConversation: UrlConversation
  messagesResult: PromiseSettledResult<ChatStoreInitialState>
  contactResult: PromiseSettledResult<ChatStoreInitialState>
}): ChatStoreInitialState => {
  const isUrlConversation = urlConversation.kind !== "none"
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
  urlConversation,
}: {
  workspaceId: string
  urlConversation: UrlConversation
}): Promise<ChatStoreInitialState | null> => {
  const conversationId =
    urlConversation.kind === "valid" ? urlConversation.id : undefined

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
  if (urlConversation.kind === "valid") {
    messagesPromise = seedMessagesState(workspaceId, urlConversation.id)
  } else if (urlConversation.kind === "invalid") {
    messagesPromise = Promise.resolve({})
  } else {
    messagesPromise = conversationsPromise.then(({ data: conversations }) => {
      const activeConversation = conversations[0]
      return activeConversation
        ? seedMessagesState(workspaceId, activeConversation.id)
        : {}
    })
  }

  const logContactSeedFailure = (err: unknown) => {
    logger.warn(
      { err, workspaceId, conversationId },
      "getInboxInitialState: failed to seed contact state",
    )
    return {}
  }

  let contactPromise: Promise<ChatStoreInitialState | Record<string, never>>
  if (findConversationPromise) {
    contactPromise = findConversationPromise
      .then((result) => seedContactState(workspaceId, result.data))
      .catch(logContactSeedFailure)
  } else if (urlConversation.kind === "invalid") {
    contactPromise = Promise.resolve({})
  } else {
    contactPromise = conversationsPromise
      .then(({ data: conversations }) => {
        const activeConversation = conversations[0]
        return activeConversation
          ? seedContactState(workspaceId, activeConversation)
          : {}
      })
      .catch(logContactSeedFailure)
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
  if (urlConversation.kind === "valid") {
    activeConversation =
      conversationResult.status === "fulfilled"
        ? (conversationResult.value?.data ?? null)
        : null
  } else if (urlConversation.kind === "none") {
    activeConversation = listedConversations[0] ?? null
  }

  return shapeInitialState({
    listedConversations,
    nextCursor,
    activeConversation,
    urlConversation,
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

  try {
    return await withTimeout(
      loadInitialState({
        workspaceId,
        urlConversation: parseUrlConversation(conversationId),
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
