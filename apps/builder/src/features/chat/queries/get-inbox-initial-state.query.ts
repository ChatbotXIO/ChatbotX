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

// Balances slow-network tolerance against blocking the page render: past this,
// the client-side fallback (loadMoreConversations/loadInitialMessages) takes
// over, so a long wait here only delays the first paint without buying
// anything the client path can't recover on its own. Each seed call also
// carries this as an AbortSignal (see `loadInitialState`), but that only
// aborts the *wait* for it here — the in-flight queries are not cancelled,
// since none of the procedure handlers read `signal` (this client is
// `createRouterClient`'s in-process call, not a fetch).
const INBOX_SEED_TIMEOUT_MS = 3000

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

/**
 * Races `promise` against `signal` firing, rejecting with `message` if the
 * signal wins. `signal` is also threaded into every seed call
 * (`loadInitialState`) as their `AbortSignal`, but a lost race only stops
 * this function from waiting on `promise` — it does not cancel the
 * in-flight oRPC calls themselves, which keep running to completion
 * unobserved (no handler in this router reads `signal`).
 */
const withAbortSignal = <T>(
  promise: Promise<T>,
  signal: AbortSignal,
  message: string,
): Promise<T> => {
  const timeout = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new Error(message))
      return
    }
    signal.addEventListener("abort", () => reject(new Error(message)), {
      once: true,
    })
  })
  return Promise.race([promise, timeout])
}

const seedMessagesState = async (
  workspaceId: string,
  conversationId: string,
  signal: AbortSignal,
): Promise<Pick<ChatStoreInitialState, "messagesSeed">> => {
  const { data, nextCursor } =
    await client.messagesAPI.listMessagesAuthenticatedAPI(
      {
        workspaceId,
        perPage: INBOX_MESSAGES_PER_PAGE,
        cursor: "",
        conversationId,
      },
      { signal },
    )

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
  signal: AbortSignal,
): Promise<ChatStoreInitialState> => {
  const contactId = conversation.contact?.id
  if (!contactId) {
    return {}
  }

  return {
    seededContact: await client.contactsAPIs.getContactAuthenticatedAPI(
      { workspaceId, contactId },
      { signal },
    ),
  }
}

const shapeInitialState = ({
  listedConversations,
  nextCursor,
  activeConversation,
  urlConversation,
  messagesState,
  contactState,
}: {
  listedConversations: ListConversationItemResource[]
  nextCursor: string | null
  activeConversation: ListConversationItemResource | null
  urlConversation: UrlConversation
  messagesState: ChatStoreInitialState
  contactState: ChatStoreInitialState
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
    ...messagesState,
    ...contactState,
  }
}

const loadInitialState = async ({
  workspaceId,
  urlConversation,
  signal,
}: {
  workspaceId: string
  urlConversation: UrlConversation
  signal: AbortSignal
}): Promise<ChatStoreInitialState | null> => {
  const conversationId =
    urlConversation.kind === "valid" ? urlConversation.id : undefined

  const conversationsPromise =
    client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI(
      {
        workspaceId,
        perPage: INBOX_CONVERSATIONS_PER_PAGE,
        cursor: "",
      },
      { signal },
    )
  const findConversationPromise = conversationId
    ? client.conversationsAPI.findConversationAuthenticatedAPI(
        { workspaceId, id: conversationId },
        { signal },
      )
    : null
  let messagesSeedConversationId = conversationId
  let messagesPromise: Promise<ChatStoreInitialState>
  if (urlConversation.kind === "valid") {
    messagesPromise = seedMessagesState(workspaceId, urlConversation.id, signal)
  } else if (urlConversation.kind === "invalid") {
    messagesPromise = Promise.resolve({})
  } else {
    messagesPromise = conversationsPromise.then(({ data: conversations }) => {
      const activeConversation = conversations[0]
      if (!activeConversation) {
        return {}
      }
      messagesSeedConversationId = activeConversation.id
      return seedMessagesState(workspaceId, activeConversation.id, signal)
    })
  }

  const logMessagesSeedFailure = (err: unknown) => {
    logger.warn(
      { err, workspaceId, conversationId: messagesSeedConversationId },
      "getInboxInitialState: failed to seed messages state",
    )
    return {}
  }
  messagesPromise = messagesPromise.catch(logMessagesSeedFailure)

  let contactSeedConversationId = conversationId
  const logContactSeedFailure = (err: unknown) => {
    logger.warn(
      { err, workspaceId, conversationId: contactSeedConversationId },
      "getInboxInitialState: failed to seed contact state",
    )
    return {}
  }

  let contactPromise: Promise<ChatStoreInitialState>
  if (findConversationPromise) {
    contactPromise = findConversationPromise
      .then((result) => {
        contactSeedConversationId = result.data.id
        return seedContactState(workspaceId, result.data, signal)
      })
      .catch(logContactSeedFailure)
  } else if (urlConversation.kind === "invalid") {
    contactPromise = Promise.resolve({})
  } else {
    contactPromise = conversationsPromise
      .then(({ data: conversations }) => {
        const activeConversation = conversations[0]
        if (!activeConversation) {
          return {}
        }
        contactSeedConversationId = activeConversation.id
        return seedContactState(workspaceId, activeConversation, signal)
      })
      .catch(logContactSeedFailure)
  }

  const [conversationsResult, conversationResult] = await Promise.allSettled([
    conversationsPromise,
    findConversationPromise ?? Promise.resolve(null),
  ])
  const [messagesState, contactState] = await Promise.all([
    messagesPromise,
    contactPromise,
  ])

  if (conversationsResult.status === "rejected") {
    logger.warn(
      { err: conversationsResult.reason, workspaceId, conversationId },
      "getInboxInitialState: failed to seed conversations",
    )
    return null
  }

  const { data: listedConversations, nextCursor } = conversationsResult.value
  let activeConversation: (typeof listedConversations)[number] | null = null
  if (urlConversation.kind === "valid") {
    if (conversationResult.status === "rejected") {
      logger.warn(
        { err: conversationResult.reason, workspaceId, conversationId },
        "getInboxInitialState: failed to seed URL conversation",
      )
    } else {
      activeConversation = conversationResult.value?.data ?? null
    }
  } else if (urlConversation.kind === "none") {
    activeConversation = listedConversations[0] ?? null
  }

  return shapeInitialState({
    listedConversations,
    nextCursor,
    activeConversation,
    urlConversation,
    messagesState,
    contactState,
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
    const signal = AbortSignal.timeout(INBOX_SEED_TIMEOUT_MS)
    return await withAbortSignal(
      loadInitialState({
        workspaceId,
        urlConversation: parseUrlConversation(conversationId),
        signal,
      }),
      signal,
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
