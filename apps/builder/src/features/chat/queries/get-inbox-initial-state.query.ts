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
import type { ContactPermissionScope } from "@/features/contacts/permissions"
import { getContact } from "@/features/contacts/queries/get-contact.query"
import {
  findConversation,
  listConversations,
} from "@/features/conversations/queries/list-conversations.query"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { listMessages } from "@/features/messages/queries"
import { logger } from "@/lib/log"

// Bounds the server-side seed wait before the client fallback takes over.
// In-process oRPC calls continue after this timeout because the signal is not
// forwarded to or read by procedure handlers. The longer window avoids a
// duplicate client refetch while a slow server query still runs.
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

/**
 * Races `promise` against `signal` firing, rejecting with `message` if the
 * signal wins. A lost race only stops this function from waiting on `promise`;
 * it does not cancel in-flight oRPC calls because no handler receives or reads
 * the signal.
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
): Promise<ChatStoreInitialState> => {
  const { data, nextCursor } = await listMessages({
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
  contactPermissionScope: ContactPermissionScope,
): Promise<ChatStoreInitialState> => {
  const contactId = conversation.contact?.id
  if (!contactId) {
    return {}
  }

  return {
    seededContact: await getContact(
      { workspaceId, contactId },
      contactPermissionScope,
    ),
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
  contactPermissionScope,
}: {
  workspaceId: string
  urlConversation: UrlConversation
  contactPermissionScope: ContactPermissionScope
}): Promise<ChatStoreInitialState | null> => {
  const conversationId =
    urlConversation.kind === "valid" ? urlConversation.id : undefined
  const conversationsPromise = listConversations(
    {
      workspaceId,
      perPage: INBOX_CONVERSATIONS_PER_PAGE,
      cursor: "",
    },
    {
      includeEmailAndPhone: contactPermissionScope.canViewEmailAndPhone,
    },
  )
  const findConversationPromise = conversationId
    ? findConversation({ workspaceId, id: conversationId })
    : null

  let activeConversationPromise: Promise<ListConversationItemResource | null>
  if (findConversationPromise) {
    activeConversationPromise = findConversationPromise.then(
      (result) => result.data,
    )
  } else if (urlConversation.kind === "invalid") {
    activeConversationPromise = Promise.resolve(null)
  } else {
    activeConversationPromise = conversationsPromise.then(
      ({ data }) => data[0] ?? null,
    )
  }

  const logSeedFailure =
    (message: string, seedConversationId: string | null) => (err: unknown) => {
      logger.warn(
        { err, workspaceId, conversationId: seedConversationId },
        message,
      )
      return {}
    }
  const messagesPromise: Promise<ChatStoreInitialState> = conversationId
    ? seedMessagesState(workspaceId, conversationId).catch(
        logSeedFailure(
          "getInboxInitialState: failed to seed messages state",
          conversationId,
        ),
      )
    : activeConversationPromise
        .then((conversation) =>
          conversation
            ? seedMessagesState(workspaceId, conversation.id).catch(
                logSeedFailure(
                  "getInboxInitialState: failed to seed messages state",
                  conversation.id,
                ),
              )
            : {},
        )
        .catch(
          logSeedFailure(
            "getInboxInitialState: failed to seed messages state",
            null,
          ),
        )

  const contactPromise: Promise<ChatStoreInitialState> =
    activeConversationPromise
      .then((conversation) =>
        conversation
          ? seedContactState(
              workspaceId,
              conversation,
              contactPermissionScope,
            ).catch(
              logSeedFailure(
                "getInboxInitialState: failed to seed contact state",
                conversation.id,
              ),
            )
          : {},
      )
      .catch(
        logSeedFailure(
          "getInboxInitialState: failed to seed contact state",
          null,
        ),
      )

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
    logger.warn(
      { err: conversationsResult.reason, workspaceId, conversationId },
      "getInboxInitialState: failed to list conversations",
    )
    return null
  }

  const { data: listedConversations, nextCursor } = conversationsResult.value
  let activeConversation: (typeof listedConversations)[number] | null = null
  if (urlConversation.kind === "valid") {
    if (conversationResult.status === "rejected") {
      logger.warn(
        { err: conversationResult.reason, workspaceId, conversationId },
        "getInboxInitialState: failed to find conversation",
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
    messagesResult,
    contactResult,
  })
}

export const getInboxInitialState = async ({
  workspaceId,
  conversationId,
  contactPermissionScope,
}: {
  workspaceId: string
  conversationId?: string
  contactPermissionScope: ContactPermissionScope
}): Promise<ChatStoreInitialState | null> => {
  try {
    const signal = AbortSignal.timeout(INBOX_SEED_TIMEOUT_MS)
    return await withAbortSignal(
      loadInitialState({
        workspaceId,
        urlConversation: parseUrlConversation(conversationId),
        contactPermissionScope,
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
