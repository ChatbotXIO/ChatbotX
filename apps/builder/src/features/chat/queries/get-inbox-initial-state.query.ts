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
  conversationId,
  contactPermissionScope,
  hasUrlConversationId,
}: {
  workspaceId: string
  conversationId?: string
  contactPermissionScope: ContactPermissionScope
  hasUrlConversationId: boolean
}): Promise<ChatStoreInitialState | null> => {
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
    ? findConversation({
        workspaceId,
        id: conversationId,
      })
    : null
  let activeConversationPromise: Promise<ListConversationItemResource | null>
  if (findConversationPromise) {
    activeConversationPromise = findConversationPromise.then(
      (result) => result.data,
    )
  } else if (hasUrlConversationId) {
    activeConversationPromise = Promise.resolve(null)
  } else {
    activeConversationPromise = conversationsPromise.then(
      ({ data }) => data[0] ?? null,
    )
  }
  const messagesPromise = conversationId
    ? seedMessagesState(workspaceId, conversationId)
    : activeConversationPromise.then((conversation) =>
        conversation ? seedMessagesState(workspaceId, conversation.id) : {},
      )
  const contactPromise = activeConversationPromise.then((conversation) =>
    conversation
      ? seedContactState(workspaceId, conversation, contactPermissionScope)
      : {},
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
  if (conversationId) {
    if (conversationResult.status === "rejected") {
      logger.warn(
        { err: conversationResult.reason, workspaceId, conversationId },
        "getInboxInitialState: failed to find conversation",
      )
    } else {
      activeConversation = conversationResult.value?.data ?? null
    }
  } else {
    activeConversation = hasUrlConversationId
      ? null
      : (listedConversations[0] ?? null)
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
        contactPermissionScope,
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
