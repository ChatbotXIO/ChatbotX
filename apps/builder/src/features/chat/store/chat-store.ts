import type {
  ChannelType,
  ConversationBotCategory,
  ConversationStatus,
} from "@chatbotx.io/database/partials"
import { resolveMessagingWindowOpenedAt } from "@chatbotx.io/sdk"
import { createStore } from "zustand/vanilla"
import type { ContactFilterRequest } from "@/features/contact-filter/schema"
import type { GetContactResponse } from "@/features/contacts/schema/query"
import type { ContactResource } from "@/features/contacts/schema/resource"
import {
  type PostDetails,
  supportsPostDetails,
} from "@/features/conversations/schema/query"
import type {
  ConversationResource,
  ListConversationItemResource,
  ListConversationsResponse,
} from "@/features/conversations/schema/resource"
import type { MessageResourceWithRelations } from "@/features/messages/schema/resource"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"
export const INBOX_CONVERSATIONS_PER_PAGE = 20
export const INBOX_MESSAGES_PER_PAGE = 20
const CONVERSATION_HEAD_REFRESH_THROTTLE_MS = 5000

/**
 * The later of two timestamps — tolerates the string a realtime payload
 * delivers in place of a Date.
 */
const latestDate = (current: Date | string | null, next: Date): Date =>
  current && new Date(current) > next ? new Date(current) : next

/**
 * What a newly arrived message changes on its conversation, or null for
 * nothing: a contact's own message marks them as replied, and any message that
 * opened the messaging window moves it forward, a call card included. Never
 * backwards, so an out-of-order older message can't shrink a window a newer one
 * opened.
 */
const conversationPatchForMessage = (
  conversation: ListConversationsResponse["data"][number] | undefined,
  message: MessageResourceWithRelations,
): Partial<ConversationResource> | null => {
  const repliedPatch =
    message.messageType === "incoming"
      ? {
          contactRepliedAt: message.createdAt,
          contactLastReadAt: message.createdAt,
        }
      : {}

  const windowOpenedAt = resolveMessagingWindowOpenedAt(message)
  const [primaryInbox, ...otherInboxes] = conversation?.contactInboxes ?? []
  const windowPatch =
    windowOpenedAt && primaryInbox
      ? {
          contactInboxes: [
            {
              ...primaryInbox,
              lastIncomingMessageAt: latestDate(
                primaryInbox.lastIncomingMessageAt,
                windowOpenedAt,
              ),
            },
            ...otherInboxes,
          ],
        }
      : {}

  const patch = { ...repliedPatch, ...windowPatch }
  return Object.keys(patch).length > 0 ? patch : null
}

const readStatePatchForMessage = (
  conversation: ListConversationsResponse["data"][number],
  message: MessageResourceWithRelations,
): Partial<ConversationResource> => {
  const isAgentReply =
    message.messageType === "outgoing" &&
    ((message.senderType === "user" && message.senderId !== null) ||
      message.senderType === "api")
  if (!isAgentReply) {
    return {}
  }
  const readAt = latestDate(
    conversation.agentLastReadAt,
    new Date(message.createdAt),
  )
  return {
    adminRepliedAt: readAt,
    agentLastReadAt: readAt,
  }
}

export type ConversationFilters = {
  botCategory?: ConversationBotCategory
  assignedId?: string
  channel?: ChannelType
  status?: ConversationStatus[]
  keyword?: string
  tags?: ("noAdminReply" | "unread" | "followUp" | "archived" | "blocked")[]
  contactFilter?: ContactFilterRequest["contactFilter"]
}

type LoadMoreConversationsOptions = {
  respectUrlConversationId?: boolean
  /**
   * Whether an empty selection may be filled in with the first loaded
   * conversation.
   *
   * Defaults to `true`. The mobile single-pane inbox passes `false`: on that
   * layout a remount of the conversation list (returning from the thread via
   * the back control) must land back on the list, not re-select a thread.
   */
  autoSelectFirst?: boolean
}

export type ChatState = {
  // conversation list
  isFirstLoadConversation: boolean
  conversations: ListConversationsResponse["data"]
  nextCursorConversation: string | null
  isLoadingConversation: boolean
  isBootstrappingUrlConversation: boolean
  activeConversationId: string | null
  filters: ConversationFilters

  // message list
  messages: MessageResourceWithRelations[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean
  // Which conversation the loaded message page belongs to, so loadInitialMessages can skip a server-seeded page.
  messagesConversationId: string | null
  // True when the first conversation was auto-selected rather than deep-linked, so mobile can suppress auto-open.
  activeConversationAutoSelected: boolean
  // The initially active conversation's server-resolved contact, used as initialData to skip a client fetch.
  seededContact: GetContactResponse | null

  // message reply selection
  replyToMessage: MessageResourceWithRelations | null
  // true when replyToMessage should be sent as a private-reply DM instead of
  // a public comment reply
  isPrivateReply: boolean

  // active facebook post (for comment conversations)
  activePost: PostDetails | null
}
// `messages`/`nextCursorMessage`/`hasNextMessagePage`/`messagesConversationId`
// must be seeded together or not at all: a `messages` seed without its
// matching `messagesConversationId` makes `loadInitialMessages` re-fetch and
// prepend a duplicate page on top of the one already in state. Nesting them
// makes a partial seed a compile error.
export type ChatStoreMessagesSeed = Pick<
  ChatState,
  | "messages"
  | "nextCursorMessage"
  | "hasNextMessagePage"
  | "messagesConversationId"
>

export type ChatStoreInitialState = Partial<
  Pick<
    ChatState,
    | "conversations"
    | "nextCursorConversation"
    | "isFirstLoadConversation"
    | "activeConversationId"
    | "activeConversationAutoSelected"
    | "seededContact"
  >
> & {
  messagesSeed?: ChatStoreMessagesSeed
}

export type ConversationAssignee = {
  id: string | null
  name: string | null
}

export type ChatActions = {
  // Conversation actions
  prependConversation: (newConversation: ListConversationItemResource) => void
  scheduleConversationHeadRefresh: (workspaceId: string) => void
  resumeConversationHeadRefresh: (workspaceId: string) => void
  dispose: () => void
  initActiveConversationFromUrl: (workspaceId: string) => Promise<void>
  /**
   * Opens a conversation by id, fetching and prepending it if not loaded. If
   * another bootstrap is in flight, waits it out instead of no-oping, so the
   * URL and the actual selection can't disagree.
   * Resolves true once conversationId is genuinely the active selection,
   * false otherwise — lets a caller sync something else only on real success.
   */
  openConversation: (
    workspaceId: string,
    conversationId: string,
  ) => Promise<boolean>
  loadMoreConversations: (
    workspaceId: string,
    options?: LoadMoreConversationsOptions,
  ) => Promise<void>
  setActiveConversationId: (activeConversationId: string | null) => void
  updateConversation: (
    conversationId: string,
    data: Partial<ListConversationItemResource>,
  ) => void
  updateConversations: (
    conversationIds: string[],
    data: Partial<ListConversationItemResource>,
  ) => void
  /**
   * Moves a conversation to the top of the loaded list — a visual reorder to
   * surface a ringing VoIP call. Never touches lastActivityAt or
   * nextCursorConversation so it can't corrupt the server's pagination cursor,
   * and doesn't persist across loadMore/resetState/a filter change. Fetches and
   * prepends when not loaded yet; a lookup failure is a silent no-op.
   */
  bubbleConversationToTop: (
    workspaceId: string,
    conversationId: string,
  ) => Promise<void>

  deleteConversation: (conversationId: string) => void
  applyAgentLastReadAt: (
    conversationIds: string[],
    agentLastReadAt: Date,
  ) => void

  // Filter actions
  resetState: () => void
  setAssignee: (assignee: ConversationAssignee) => void
  setFilters: (filters: ConversationFilters) => void

  // Message actions
  appendMessage: (message: MessageResourceWithRelations) => void
  markMessagesDeleted: (messageIds: string[]) => void
  markMessagesRestored: (messageIds: string[]) => void
  markMessageFailed: (
    messageId: string,
    clientId: string | undefined,
    error: string | null,
  ) => void
  assignMessageCommentId: (messageId: string, commentId: string) => void
  updateMessageContentAttributes: (
    messageId: string,
    contentAttributes: Record<string, unknown>,
  ) => void
  updateMessageAttributes: (
    messageId: string,
    attributes: { liked: boolean; hidden: boolean },
  ) => void
  updateMessageText: (
    messageId: string,
    newText: string,
    attachmentUpdate?: {
      newAttachmentPath: string | null
      newAttachmentPublicUrl?: string | null
      newAttachmentMimeType?: string | null
      newAttachmentWidth?: number
      newAttachmentHeight?: number
      removedAttachment: boolean
    },
  ) => void
  loadMoreMessages: (workspaceId: string, perPage: number) => Promise<void>
  loadInitialMessages: (workspaceId: string, perPage: number) => Promise<void>
  handleNewMessage: (message: MessageResourceWithRelations) => void
  setReplyToMessage: (
    message: MessageResourceWithRelations | null,
    isPrivate?: boolean,
  ) => void

  // Post actions
  loadActivePost: (workspaceId: string) => Promise<void>

  // Contact actions
  updateContact: (contactId: string, data: Partial<ContactResource>) => void
}

export type ChatStore = ChatState & ChatActions

/**
 * False only once a page has loaded and the server returned no further cursor.
 * After a failed first load, scrolling does not retry; the error toast plus a
 * filter change, which resets this state, is the retry path.
 */
export const selectHasNextConversationPage = (
  state: Pick<ChatState, "isFirstLoadConversation" | "nextCursorConversation">,
) => state.isFirstLoadConversation || state.nextCursorConversation !== null

const appendUniqueConversations = (
  current: ListConversationsResponse["data"],
  incoming: ListConversationsResponse["data"],
): ListConversationsResponse["data"] => {
  const existingIds = new Set(current.map((conversation) => conversation.id))
  return [
    ...current,
    ...incoming.filter((conversation) => !existingIds.has(conversation.id)),
  ]
}

/**
 * Moves `conversation` to index 0 (replacing any stale copy). The active
 * conversation gets no special treatment: it only reaches the top when it
 * has activity of its own or is opened from the URL, so a message on another
 * conversation lands above it exactly as it does on the server.
 */
const moveConversationToTop = (
  list: ListConversationsResponse["data"],
  conversation: ListConversationItemResource,
): ListConversationsResponse["data"] => [
  conversation,
  ...list.filter((item) => item.id !== conversation.id),
]

// Realtime events are unordered; activity only ever moves forward so a
// delayed older event cannot make a conversation look read.
const latestActivityAt = <T extends Date | string>(
  current: T | null | undefined,
  incoming: T,
): T =>
  current !== null &&
  current !== undefined &&
  new Date(current).getTime() > new Date(incoming).getTime()
    ? current
    : incoming

const hasLaterActivityAt = (
  current: Date | string | null | undefined,
  incoming: Date | string | null | undefined,
) => {
  if (!current) {
    return false
  }
  if (!incoming) {
    return true
  }
  return (
    new Date(latestActivityAt(current, incoming)).getTime() >
    new Date(incoming).getTime()
  )
}

const hasConversationIdInUrl = () =>
  !!new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("conversationId")

/**
 * Shared core of initActiveConversationFromUrl and openConversation: selects
 * conversationId if already loaded, otherwise fetches and prepends it. Callers
 * own their own guard; this only touches conversations/activeConversationId. A
 * fetch failure is logged and swallowed.
 */
const loadAndSelectConversation = async (
  get: () => ChatStore,
  workspaceId: string,
  conversationId: string,
): Promise<void> => {
  const { conversations, prependConversation, setActiveConversationId } = get()
  const loadedConversation = conversations.find(
    (conversation) => conversation.id === conversationId,
  )
  if (loadedConversation) {
    setActiveConversationId(conversationId)
    prependConversation(loadedConversation)
    return
  }

  try {
    const response =
      await client.conversationsAPI.findConversationAuthenticatedAPI({
        workspaceId,
        id: conversationId,
      })
    setActiveConversationId(conversationId)
    prependConversation(response.data)
  } catch (error) {
    logger.warn(
      { err: error, conversationId },
      "loadAndSelectConversation: failed to load conversation",
    )
  }
}

type ConversationListState = Pick<
  ChatState,
  | "isFirstLoadConversation"
  | "conversations"
  | "nextCursorConversation"
  | "isLoadingConversation"
  | "isBootstrappingUrlConversation"
  | "activeConversationId"
>

const conversationListDefaults = (): ConversationListState => ({
  isFirstLoadConversation: true,
  conversations: [],
  nextCursorConversation: null,
  isLoadingConversation: false,
  isBootstrappingUrlConversation: false,
  activeConversationId: null,
})

type MessageThreadState = Pick<
  ChatState,
  | "messages"
  | "nextCursorMessage"
  | "isLoadMoreMessage"
  | "hasNextMessagePage"
  | "messagesConversationId"
  | "activeConversationAutoSelected"
  | "seededContact"
  | "replyToMessage"
  | "isPrivateReply"
  | "activePost"
>

// The message-thread fields that must be cleared together whenever the
// active conversation changes (or is unset) — otherwise a stale
// `activeConversationAutoSelected`/`messagesConversationId` etc. from the
// previous conversation leaks into the next one.
const messageThreadDefaults = (): MessageThreadState => ({
  messages: [],
  nextCursorMessage: null,
  isLoadMoreMessage: false,
  hasNextMessagePage: true,
  messagesConversationId: null,
  activeConversationAutoSelected: false,
  seededContact: null,
  replyToMessage: null,
  isPrivateReply: false,
  activePost: null,
})

const shouldAutoSelectConversation = ({
  activeConversationId,
  hasUrlConversationId,
  conversations,
}: {
  activeConversationId: string | null
  hasUrlConversationId: boolean
  conversations: ListConversationsResponse["data"]
}) =>
  !(activeConversationId || hasUrlConversationId) && conversations.length > 0

/**
 * `ChatStoreInitialState` is a `Partial` of independently-optional fields, so
 * nothing in the type stops a producer from setting `activeConversationId` to
 * an id absent from `conversations` — an invariant `getInboxInitialState`
 * upholds today only by construction (`shapeInitialState` always prepends
 * `activeConversation` into `conversations` first), not by the type system.
 * Selectors elsewhere assume `conversations.find(c => c.id ===
 * activeConversationId)` resolves, so a mismatch would silently produce
 * `undefined` rather than an error — logged here so a future second seed
 * producer that breaks the pairing is caught instead of debugged blind.
 */
const warnIfActiveConversationUnlisted = (
  initialState: ChatStoreInitialState,
): void => {
  const { activeConversationId, conversations } = initialState
  if (!(activeConversationId && conversations)) {
    return
  }
  const isListed = conversations.some((c) => c.id === activeConversationId)
  if (!isListed) {
    logger.warn(
      { activeConversationId },
      "createChatStore: activeConversationId in the seeded initial state is not present in the seeded conversations list",
    )
  }
}

export const createChatStore = (initialState: ChatStoreInitialState = {}) => {
  warnIfActiveConversationUnlisted(initialState)

  // The conversationId of the most recently issued openConversation call — lets
  // a call that just finished waiting tell whether a newer call superseded it.
  // A closure variable rather than store state since it's only read/written
  // inside openConversation and never rendered.
  let pendingOpenConversationId: string | null = null
  let lastConversationHeadRefreshAt = Number.NEGATIVE_INFINITY
  let conversationHeadRefreshInFlight: Promise<void> | null = null
  let conversationHeadRefreshPending = false
  let conversationHeadRefreshTimer: number | null = null
  let pendingConversationHeadRefreshWorkspaceId: string | null = null
  const { messagesSeed, ...restInitialState } = initialState

  return createStore<ChatStore>((set, get, store) => {
    const waitUntilState = (
      predicate: (state: ChatStore) => boolean,
    ): Promise<void> =>
      new Promise<void>((resolve) => {
        const unsubscribe = store.subscribe((state) => {
          if (predicate(state)) {
            unsubscribe()
            resolve()
          }
        })
      })

    return {
      ...conversationListDefaults(),
      filters: {},
      ...messageThreadDefaults(),

      ...restInitialState,
      ...messagesSeed,

      prependConversation: (newConversation: ListConversationItemResource) =>
        set((state) => ({
          conversations: moveConversationToTop(
            state.conversations,
            newConversation,
          ),
        })),

      resumeConversationHeadRefresh: (workspaceId: string) => {
        if (!conversationHeadRefreshPending) {
          return
        }
        get().scheduleConversationHeadRefresh(workspaceId)
      },

      scheduleConversationHeadRefresh: (workspaceId: string) => {
        conversationHeadRefreshPending = true
        pendingConversationHeadRefreshWorkspaceId = workspaceId
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "hidden"
        ) {
          return
        }

        const now = Date.now()
        if (conversationHeadRefreshInFlight) {
          return
        }
        const throttleDelay = Math.max(
          0,
          CONVERSATION_HEAD_REFRESH_THROTTLE_MS -
            (now - lastConversationHeadRefreshAt),
        )
        if (throttleDelay > 0) {
          if (conversationHeadRefreshTimer) {
            return
          }
          conversationHeadRefreshTimer = window.setTimeout(() => {
            conversationHeadRefreshTimer = null
            get().scheduleConversationHeadRefresh(workspaceId)
          }, throttleDelay)
          return
        }

        if (conversationHeadRefreshTimer) {
          clearTimeout(conversationHeadRefreshTimer)
          conversationHeadRefreshTimer = null
        }
        conversationHeadRefreshPending = false
        pendingConversationHeadRefreshWorkspaceId = null
        lastConversationHeadRefreshAt = now
        const requestedFilters = get().filters
        conversationHeadRefreshInFlight = (async () => {
          try {
            const { data: headConversations } =
              await client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI(
                {
                  workspaceId,
                  perPage: INBOX_CONVERSATIONS_PER_PAGE,
                  cursor: "",
                  ...requestedFilters,
                },
                { signal: AbortSignal.timeout(30_000) },
              )

            if (get().filters !== requestedFilters) {
              return
            }

            set((state) => {
              const existingIds = new Set(
                state.conversations.map((conversation) => conversation.id),
              )
              const newConversations = headConversations.filter(
                (conversation) => {
                  if (existingIds.has(conversation.id)) {
                    return false
                  }
                  existingIds.add(conversation.id)
                  return true
                },
              )
              if (newConversations.length === 0) {
                return state
              }
              return {
                conversations: [...newConversations, ...state.conversations],
              }
            })
          } catch (error) {
            logger.warn(
              { err: error, workspaceId },
              "scheduleConversationHeadRefresh: failed to refresh conversation head",
            )
          } finally {
            conversationHeadRefreshInFlight = null
            const pendingWorkspaceId = pendingConversationHeadRefreshWorkspaceId
            if (conversationHeadRefreshPending && pendingWorkspaceId) {
              get().scheduleConversationHeadRefresh(pendingWorkspaceId)
            }
          }
        })()
      },
      dispose: () => {
        if (conversationHeadRefreshTimer) {
          clearTimeout(conversationHeadRefreshTimer)
          conversationHeadRefreshTimer = null
        }
        conversationHeadRefreshPending = false
        pendingConversationHeadRefreshWorkspaceId = null
      },
      initActiveConversationFromUrl: async (workspaceId: string) => {
        const urlParams = new URLSearchParams(
          typeof window === "undefined" ? "" : window.location.search,
        )
        const conversationId = urlParams.get("conversationId")
        if (!conversationId) {
          return
        }

        const { activeConversationId, isBootstrappingUrlConversation } = get()
        if (activeConversationId || isBootstrappingUrlConversation) {
          return
        }

        set({ isBootstrappingUrlConversation: true })

        try {
          if (get().isFirstLoadConversation && get().isLoadingConversation) {
            await waitUntilState(
              (state) =>
                !(state.isFirstLoadConversation && state.isLoadingConversation),
            )
          }

          await loadAndSelectConversation(get, workspaceId, conversationId)
        } finally {
          set({ isBootstrappingUrlConversation: false })
        }
      },

      openConversation: async (workspaceId: string, conversationId: string) => {
        if (get().activeConversationId === conversationId) {
          return true
        }

        // Claims this call as the most recently requested openConversation —
        // rechecked after any wait so a newer call for a different id makes this
        // one step aside instead of both racing to load.
        pendingOpenConversationId = conversationId

        // A concurrent bootstrap is already in flight — wait it out instead of
        // silently no-oping, so a caller that already synced the URL's
        // conversationId isn't left disagreeing with the actual selection. Same
        // wait pattern initActiveConversationFromUrl uses.
        if (get().isBootstrappingUrlConversation) {
          await waitUntilState((state) => !state.isBootstrappingUrlConversation)
          // The bootstrap we waited out may already have selected this exact
          // conversation.
          if (get().activeConversationId === conversationId) {
            return true
          }
          // A newer openConversation call (for a different id) was issued while
          // this one waited — it now owns the load; this one resolves false
          // instead of racing.
          if (pendingOpenConversationId !== conversationId) {
            return false
          }
        }

        set({ isBootstrappingUrlConversation: true })
        try {
          await loadAndSelectConversation(get, workspaceId, conversationId)
        } finally {
          set({ isBootstrappingUrlConversation: false })
        }
        return get().activeConversationId === conversationId
      },

      loadMoreConversations: async (
        workspaceId: string,
        options: LoadMoreConversationsOptions = {},
      ) => {
        const { isLoadingConversation, nextCursorConversation } = get()
        if (isLoadingConversation || !selectHasNextConversationPage(get())) {
          return
        }

        // fetch next conversation list
        const { activeConversationId, filters } = get()
        const shouldRespectUrlConversationId =
          options.respectUrlConversationId ?? true
        const autoSelectFirst = options.autoSelectFirst ?? true
        set({ isLoadingConversation: true })

        try {
          const { data: newConversations, nextCursor } =
            await client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI(
              {
                workspaceId,
                perPage: INBOX_CONVERSATIONS_PER_PAGE,
                cursor: nextCursorConversation ?? "",
                ...filters,
              },
              // This endpoint fans out into per-conversation sharded message
              // lookups, which can legitimately take longer under cold caches
              // or dev-server recompiles, so a longer explicit timeout avoids
              // spurious aborts.
              { signal: AbortSignal.timeout(30_000) },
            )

          const hasUrlConversationId =
            shouldRespectUrlConversationId && hasConversationIdInUrl()
          const firstConversationToOpen =
            autoSelectFirst &&
            shouldAutoSelectConversation({
              activeConversationId,
              hasUrlConversationId,
              conversations: newConversations,
            })
              ? newConversations[0]
              : null

          set((state) => ({
            conversations: appendUniqueConversations(
              state.conversations,
              newConversations,
            ),
            nextCursorConversation: nextCursor,
            isLoadingConversation: false,
            isFirstLoadConversation: false,
          }))

          if (firstConversationToOpen) {
            get().setActiveConversationId(firstConversationToOpen.id)
            set({ activeConversationAutoSelected: true })
          }
        } catch (error) {
          set({
            isLoadingConversation: false,
            isFirstLoadConversation: false,
          })
          throw error
        }
      },

      setActiveConversationId: (activeConversationId: string | null) => {
        const {
          activeConversationId: oldActiveConversationId,
          activeConversationAutoSelected,
        } = get()
        if (oldActiveConversationId !== activeConversationId) {
          set({
            activeConversationId,
            ...messageThreadDefaults(),
          })
          return
        }

        if (activeConversationAutoSelected) {
          set({ activeConversationAutoSelected: false })
        }
      },

      deleteConversation: (conversationId: string) => {
        const { conversations, activeConversationId } = get()
        const updatedConversations = conversations.filter(
          (c) => c.id !== conversationId,
        )
        if (activeConversationId !== conversationId) {
          set({ conversations: updatedConversations })
          return
        }

        set({
          conversations: updatedConversations,
          activeConversationId: updatedConversations[0]?.id ?? null,
          ...messageThreadDefaults(),
        })
      },

      applyAgentLastReadAt: (conversationIds, agentLastReadAt) => {
        if (Number.isNaN(agentLastReadAt.getTime())) {
          return
        }
        const targetIds = new Set(conversationIds)
        set((state) => ({
          conversations: state.conversations.map((conversation) => {
            if (!targetIds.has(conversation.id)) {
              return conversation
            }
            const current = conversation.agentLastReadAt
            if (current !== null && new Date(current) >= agentLastReadAt) {
              return conversation
            }
            return { ...conversation, agentLastReadAt }
          }),
        }))
      },

      resetState: () => {
        set({
          ...conversationListDefaults(),
          ...messageThreadDefaults(),
        })
      },

      setFilters: (filters: ConversationFilters) => {
        set({ filters })
      },

      setAssignee: ({ id }: ConversationAssignee) => {
        const { conversations, activeConversationId } = get()
        const conversationIndex = conversations.findIndex(
          (c) => c.id === activeConversationId,
        )

        if (conversationIndex > -1) {
          const updatedConversations = [...conversations]
          const conversation = { ...updatedConversations[conversationIndex] }

          if (id === null) {
            conversation.assignedUser = null
            conversation.assignedUserId = null
            conversation.assignedInboxTeam = null
            conversation.assignedInboxTeamId = null
          } else if (id.startsWith("u_")) {
            conversation.assignedUser = null
            conversation.assignedUserId = id.slice(2)
            conversation.assignedInboxTeam = null
            conversation.assignedInboxTeamId = null
          } else if (id.startsWith("t_")) {
            conversation.assignedUser = null
            conversation.assignedUserId = null
            conversation.assignedInboxTeam = null
            conversation.assignedInboxTeamId = id.slice(2)
          }

          updatedConversations[conversationIndex] = conversation
          set({ conversations: updatedConversations })
        }
      },

      setReplyToMessage: (message, isPrivate = false) =>
        set({
          replyToMessage: message,
          isPrivateReply: message ? isPrivate : false,
        }),

      appendMessage: (message: MessageResourceWithRelations) => {
        set((state) => {
          if (state.messages.some((m) => m.id === message.id)) {
            return state
          }
          const messageTime = new Date(message.createdAt).getTime()
          const insertIndex = state.messages.findIndex(
            (m) => new Date(m.createdAt).getTime() > messageTime,
          )
          if (insertIndex === -1) {
            return { messages: [...state.messages, message] }
          }
          const messages = [...state.messages]
          messages.splice(insertIndex, 0, message)
          return { messages }
        })
      },

      updateMessageAttributes: (messageId, attributes) => {
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === messageId ? { ...message, attributes } : message,
          ),
        }))
      },

      // Merges a contentAttributes patch pushed via messageContentUpdated (e.g. a
      // transcript arriving after the recording message) — a full replace, not a
      // deep merge, matching how the worker always sends the entity's complete
      // shape.
      updateMessageContentAttributes: (messageId, contentAttributes) => {
        set((state) => ({
          messages: state.messages.map((message): typeof message =>
            message.id === messageId
              ? { ...message, contentAttributes }
              : message,
          ),
        }))
      },

      markMessagesDeleted: (messageIds: string[]) => {
        const idSet = new Set(messageIds)
        const now = new Date()
        set((state) => ({
          messages: state.messages.map((message) =>
            idSet.has(message.id) ? { ...message, deletedAt: now } : message,
          ),
        }))
      },

      markMessagesRestored: (messageIds: string[]) => {
        const idSet = new Set(messageIds)
        set((state) => ({
          messages: state.messages.map((message) =>
            idSet.has(message.id) ? { ...message, deletedAt: null } : message,
          ),
        }))
      },

      markMessageFailed: (
        messageId: string,
        clientId: string | undefined,
        error: string | null,
      ) => {
        set((state) => {
          const matchesByClientId =
            clientId && state.messages.some((m) => m.clientId === clientId)
          return {
            messages: state.messages.map((message) =>
              (
                matchesByClientId
                  ? message.clientId === clientId
                  : message.id === messageId
              )
                ? { ...message, sendError: error }
                : message,
            ),
          }
        })
      },

      assignMessageCommentId: (messageId, commentId) => {
        set((state) => ({
          messages: state.messages.map((message): typeof message =>
            message.id === messageId
              ? { ...message, sourceId: commentId }
              : message,
          ),
        }))
      },

      updateMessageText: (messageId, newText, attachmentUpdate) => {
        set((state) => ({
          messages: state.messages.map((message): typeof message => {
            if (message.id !== messageId) {
              return message
            }
            const base = { ...message, text: newText }
            if (!attachmentUpdate) {
              return base
            }
            if (attachmentUpdate.removedAttachment) {
              return { ...base, attachments: [] }
            }
            if (attachmentUpdate.newAttachmentPath) {
              const mimeType =
                attachmentUpdate.newAttachmentMimeType ??
                "application/octet-stream"
              let fileType: "image" | "video" | "audio" | "file" = "file"
              if (mimeType.startsWith("image/")) {
                fileType = "image"
              } else if (mimeType.startsWith("video/")) {
                fileType = "video"
              } else if (mimeType.startsWith("audio/")) {
                fileType = "audio"
              }
              return {
                ...base,
                attachments: [
                  {
                    id: "pending",
                    workspaceId: message.workspaceId,
                    conversationId: message.conversationId,
                    messageId: message.id,
                    messageCreatedAt: message.createdAt,
                    originPath: attachmentUpdate.newAttachmentPath,
                    fileType,
                    mimeType,
                    url: attachmentUpdate.newAttachmentPublicUrl ?? null,
                    name: null,
                    size: 0,
                    width: attachmentUpdate.newAttachmentWidth ?? null,
                    height: attachmentUpdate.newAttachmentHeight ?? null,
                    sourceId: null,
                    thumbnailPath: null,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                ],
              }
            }
            return base
          }),
        }))
      },

      loadMoreMessages: async (workspaceId: string, perPage: number) => {
        const { isLoadMoreMessage, hasNextMessagePage } = get()
        if (isLoadMoreMessage || !hasNextMessagePage) {
          return
        }

        const { nextCursorMessage, messages, activeConversationId } = get()
        set({ isLoadMoreMessage: true })

        try {
          const { data, nextCursor } =
            await client.messagesAPI.listMessagesAuthenticatedAPI({
              workspaceId,
              perPage,
              cursor: nextCursorMessage ?? "",
              conversationId: activeConversationId ?? undefined,
            })
          set({
            messages: [...data.reverse(), ...messages],
            nextCursorMessage: nextCursor,
            hasNextMessagePage: nextCursor !== null,
            isLoadMoreMessage: false,
            messagesConversationId: activeConversationId,
          })
        } catch (error) {
          // Reset the in-flight flag or the `isLoadMoreMessage` guard above
          // would block every later scroll-up load for this store instance.
          set({ isLoadMoreMessage: false })
          throw error
        }
      },

      loadInitialMessages: async (workspaceId: string, perPage: number) => {
        const {
          activeConversationId,
          messagesConversationId,
          loadMoreMessages,
        } = get()
        if (messagesConversationId === activeConversationId) {
          return
        }
        await loadMoreMessages(workspaceId, perPage)
      },

      updateConversationViaMessage: (message: MessageResource) => {
        let matchedConversation = false
        set((state) => {
          const conversationIndex = state.conversations.findIndex(
            (conversation) => conversation.id === message.conversationId,
          )
          if (conversationIndex === -1) {
            return state
          }

          matchedConversation = true
          const currentConversation = state.conversations[conversationIndex]
          const conversation = {
            ...currentConversation,
            messages: [message],
            lastActivityAt: latestActivityAt(
              currentConversation.lastActivityAt,
              message.createdAt,
            ),
          }
          return {
            conversations: moveConversationToTop(
              state.conversations,
              conversation,
            ),
          }
        })

        if (!matchedConversation) {
          get().scheduleConversationHeadRefresh(message.workspaceId)
        }
      },
      bubbleConversationToTop: async (
        workspaceId: string,
        conversationId: string,
      ) => {
        const { conversations, prependConversation } = get()
        const conversationIndex = conversations.findIndex(
          (c) => c.id === conversationId,
        )

        if (conversationIndex > -1) {
          set((state) => {
            const conversation = state.conversations.find(
              (item) => item.id === conversationId,
            )
            return conversation
              ? {
                  conversations: moveConversationToTop(
                    state.conversations,
                    conversation,
                  ),
                }
              : state
          })
          return
        }

        // Not loaded client-side — fetch and prepend it. The message path
        // schedules a head refresh for unseen rows; this call-specific path keeps
        // the ringing conversation visible. A lookup failure is a no-op: the
        // ringing state still lives in the VoIP call store, so the dock and dialog
        // keep working even if the list can't show the row.
        try {
          const response =
            await client.conversationsAPI.findConversationAuthenticatedAPI({
              workspaceId,
              id: conversationId,
            })
          prependConversation(response.data)
        } catch (error) {
          // Not surfaced as a toast, since the VoIP call store keeps the
          // dock/dialog working regardless. But a real network/auth/5xx failure
          // must stay distinguishable from the "filtered out" case, so log it.
          logger.warn(
            { err: error, conversationId },
            "bubbleConversationToTop: failed to fetch conversation to prepend",
          )
        }
      },

      updateConversation: (
        conversationId: string,
        data: Partial<ConversationResource>,
      ) => {
        const { conversations } = get()
        const conversationIndex = conversations.findIndex(
          (c) => c.id === conversationId,
        )
        if (conversationIndex > -1) {
          const updatedConversations = [...conversations]
          updatedConversations[conversationIndex] = {
            ...updatedConversations[conversationIndex],
            ...data,
          }

          set({ conversations: updatedConversations })
        }
      },

      updateConversations: (
        conversationIds: string[],
        data: Partial<ConversationResource>,
      ) => {
        if (conversationIds.length === 0) {
          return
        }

        const { conversations } = get()
        const targetIds = new Set(conversationIds)
        if (
          !conversations.some((conversation) => targetIds.has(conversation.id))
        ) {
          return
        }

        set({
          conversations: conversations.map((conversation) =>
            targetIds.has(conversation.id)
              ? { ...conversation, ...data }
              : conversation,
          ),
        })
      },

      handleNewMessage: (message: MessageResourceWithRelations) => {
        const { messages, activeConversationId, appendMessage } = get()
        let matchedConversation = false

        set((state) => {
          const conversationIndex = state.conversations.findIndex(
            (conversation) => conversation.id === message.conversationId,
          )
          if (conversationIndex === -1) {
            return state
          }

          matchedConversation = true
          const updatedConversations = [...state.conversations]
          const currentConversation = updatedConversations[conversationIndex]
          const conversationPatch = conversationPatchForMessage(
            currentConversation,
            message,
          )
          const readStatePatch = readStatePatchForMessage(
            currentConversation,
            message,
          )
          const conversation = {
            ...currentConversation,
            ...(conversationPatch ?? {}),
            ...readStatePatch,
            messages: [message],
            lastActivityAt: latestActivityAt(
              currentConversation.lastActivityAt,
              message.createdAt,
            ),
          }

          updatedConversations.splice(conversationIndex, 1)
          return { conversations: [conversation, ...updatedConversations] }
        })

        if (!matchedConversation) {
          get().scheduleConversationHeadRefresh(message.workspaceId)
        }

        if (message.conversationId !== activeConversationId) {
          return
        }

        if (message.clientId) {
          const messageIndex = messages.findIndex(
            (currentMessage) => currentMessage.clientId === message.clientId,
          )

          if (messageIndex > -1) {
            const newMessages = [...messages]
            newMessages[messageIndex] = {
              ...newMessages[messageIndex],
              ...message,
              // messageCreated's payload is captured before the async send job
              // runs, so its sendError is always null at broadcast time — keep
              // a sendError already recorded by markMessageFailed instead of
              // letting this stale snapshot clobber it.
              sendError:
                newMessages[messageIndex].sendError ?? message.sendError,
            }
            set({ messages: newMessages })
            return
          }
        }

        // Every relation added by MessageResourceWithRelations is optional, so
        // the realtime base-message payload is safe to append without a refetch.
        appendMessage(message)
      },

      loadActivePost: async (workspaceId: string) => {
        const { conversations, activeConversationId } = get()
        const conversation = conversations.find(
          (c) => c.id === activeConversationId,
        )
        const contactInbox = conversation?.contactInboxes?.[0]
        const postId = conversation?.sourceId
        const inboxId = contactInbox?.inboxId
        const channel = contactInbox?.channel

        if (!(postId && inboxId && supportsPostDetails(channel))) {
          set({ activePost: null })
          return
        }

        try {
          const post =
            await client.conversationsAPI.getPostDetailsAuthenticatedAPI({
              workspaceId,
              inboxId,
              postId,
              channel,
            })
          set({ activePost: post })
        } catch {
          set({ activePost: null })
        }
      },

      updateContact: (contactId: string, data: Partial<ContactResource>) => {
        const { conversations } = get()
        const hasMatch = conversations.some((c) => c.contactId === contactId)
        if (!hasMatch) {
          return
        }

        set({
          conversations: conversations.map((conversation) =>
            conversation.contactId === contactId && conversation.contact
              ? {
                  ...conversation,
                  contact: { ...conversation.contact, ...data },
                }
              : conversation,
          ),
        })
      },
    }
  })
}
