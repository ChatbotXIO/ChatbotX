import "server-only"

import { zodBigintAsString } from "@chatbotx.io/utils"
import type { ChatStoreInitialState } from "@/features/chat/store/chat-store"
import { INBOX_CONVERSATIONS_PER_PAGE } from "@/features/chat/store/chat-store"
import type { ContactPermissionScope } from "@/features/contacts/permissions"
import { getContact } from "@/features/contacts/queries/get-contact.query"
import {
  findConversation,
  listConversations,
} from "@/features/conversations/queries/list-conversations.query"
import type { ListConversationItemResource } from "@/features/conversations/schema/resource"
import { listMessages } from "@/features/messages/queries"
import { logger } from "@/lib/log"

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
  const { data, nextCursor } = await listMessages({
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
  permissionScope: ContactPermissionScope,
): Promise<ChatStoreInitialState> => {
  const contactId = conversation.contact?.id
  if (!contactId) {
    return {}
  }

  return {
    seededContact: await getContact(
      { workspaceId, contactId },
      permissionScope,
    ),
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
  canViewEmailAndPhone,
  contactPermissionScope,
  seedConversationDetails,
}: {
  workspaceId: string
  conversationId?: string
  canViewEmailAndPhone: boolean
  contactPermissionScope: ContactPermissionScope
  seedConversationDetails: boolean
}): Promise<ChatStoreInitialState | null> => {
  const conversationsPromise = listConversations(
    {
      workspaceId,
      perPage: INBOX_CONVERSATIONS_PER_PAGE,
      cursor: "",
    },
    { includeEmailAndPhone: canViewEmailAndPhone },
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

    if (!(seedConversationDetails && activeConversation)) {
      return state
    }

    const [messages, contact] = await Promise.allSettled([
      seedMessagesState(workspaceId, activeConversation.id),
      seedContactState(workspaceId, activeConversation, contactPermissionScope),
    ])

    return {
      ...state,
      ...mergeSettledState([messages, contact]),
    }
  }

  const findConversationPromise = findConversation({
    workspaceId,
    id: conversationId,
  })
  const contactPromise = seedConversationDetails
    ? findConversationPromise.then(({ data }) =>
        seedContactState(workspaceId, data, contactPermissionScope),
      )
    : Promise.resolve({})

  const messagesPromise = seedConversationDetails
    ? seedMessagesState(workspaceId, conversationId)
    : Promise.resolve({})

  const [
    conversationsResult,
    conversationResult,
    messagesResult,
    contactResult,
  ] = await Promise.allSettled([
    conversationsPromise,
    findConversationPromise,
    messagesPromise,
    contactPromise,
  ])

  if (conversationsResult.status === "rejected") {
    logger.warn(
      { err: conversationsResult.reason, workspaceId, conversationId },
      "getInboxInitialState: failed to load conversations",
    )
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
  canViewEmailAndPhone,
  contactPermissionScope,
  seedConversationDetails = true,
}: {
  workspaceId: string
  conversationId?: string
  canViewEmailAndPhone: boolean
  contactPermissionScope: ContactPermissionScope
  seedConversationDetails?: boolean
}): Promise<ChatStoreInitialState | null> => {
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
        canViewEmailAndPhone,
        contactPermissionScope,
        seedConversationDetails,
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
