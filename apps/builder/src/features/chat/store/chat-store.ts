import type {
  ChannelType,
  ConversationBotCategory,
  ConversationStatus,
} from "@chatbotx.io/database/partials"
import { resolveMessagingWindowOpenedAt } from "@chatbotx.io/sdk"
import { createStore } from "zustand/vanilla"
import type { ContactFilterRequest } from "@/features/contact-filter/schema"
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
import type {
  MessageResource,
  MessageResourceWithRelations,
} from "@/features/messages/schema/resource"
import { logger } from "@/lib/log"
import { client } from "@/lib/orpc/orpc"

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
  hasNextConversationPage: boolean
  filters: ConversationFilters

  // message list
  messages: MessageResourceWithRelations[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean

  // message reply selection
  replyToMessage: MessageResourceWithRelations | null
  // true when replyToMessage should be sent as a private-reply DM instead of
  // a public comment reply
  isPrivateReply: boolean

  // active facebook post (for comment conversations)
  activePost: PostDetails | null
}

export type ChatActions = {
  // Conversation actions
  prependConversation: (newConversation: ListConversationItemResource) => void
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
    data: Partial<ConversationResource>,
  ) => void
  updateConversations: (
    conversationIds: string[],
    data: Partial<ConversationResource>,
  ) => void
  updateConversationViaMessage: (message: MessageResource) => void
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
  readConversation: (conversationId: string) => void

  // Filter actions
  resetState: () => void
  setAssignee: (value: string | null) => void
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
    prependConversation(loadedConversation)
    setActiveConversationId(conversationId)
    return
  }

  try {
    const response =
      await client.conversationsAPI.findConversationAuthenticatedAPI({
        workspaceId,
        id: conversationId,
      })
    prependConversation(response.data)
    setActiveConversationId(conversationId)
  } catch (error) {
    logger.warn(
      { err: error, conversationId },
      "loadAndSelectConversation: failed to load conversation",
    )
  }
}

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

export const createChatStore = () => {
  // The conversationId of the most recently issued openConversation call — lets
  // a call that just finished waiting tell whether a newer call superseded it.
  // A closure variable rather than store state since it's only read/written
  // inside openConversation and never rendered.
  let pendingOpenConversationId: string | null = null

  return createStore<ChatStore>((set, get, store) => ({
    // default conversation state
    isFirstLoadConversation: true,
    conversations: [],
    nextCursorConversation: null,
    isLoadingConversation: false,
    isBootstrappingUrlConversation: false,
    hasNextConversationPage: true,
    activeConversationId: null,
    filters: {},

    // default message state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,
    replyToMessage: null,
    isPrivateReply: false,
    activePost: null,

    prependConversation: (newConversation: ListConversationItemResource) =>
      set((state) => ({
        conversations: [
          newConversation,
          ...state.conversations.filter((c) => c.id !== newConversation.id),
        ],
      })),

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
          await new Promise<void>((resolve) => {
            const unsubscribe = store.subscribe((state) => {
              if (
                !(state.isFirstLoadConversation && state.isLoadingConversation)
              ) {
                unsubscribe()
                resolve()
              }
            })
          })
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
        await new Promise<void>((resolve) => {
          const unsubscribe = store.subscribe((state) => {
            if (!state.isBootstrappingUrlConversation) {
              unsubscribe()
              resolve()
            }
          })
        })
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
      const { isLoadingConversation, hasNextConversationPage } = get()
      if (isLoadingConversation || !hasNextConversationPage) {
        return
      }

      // fetch next conversation list
      const { nextCursorConversation, activeConversationId, filters } = get()
      const shouldRespectUrlConversationId =
        options.respectUrlConversationId ?? true
      const autoSelectFirst = options.autoSelectFirst ?? true
      set({ isLoadingConversation: true })

      try {
        const { data: newConversations, nextCursor } =
          await client.conversationsAPI.listConversationsByPOSTAuthenticatedAPI(
            {
              workspaceId,
              perPage: 20,
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
      const { activeConversationId: oldActiveConversationId } = get()
      if (oldActiveConversationId !== activeConversationId) {
        set({
          activeConversationId,
          messages: [],
          nextCursorMessage: null,
          hasNextMessagePage: true,
          isLoadMoreMessage: false,
          replyToMessage: null,
          isPrivateReply: false,
          activePost: null,
        })
      }
    },

    deleteConversation: (conversationId: string) => {
      const { conversations, activeConversationId } = get()
      const updatedConversations = conversations.filter(
        (c) => c.id !== conversationId,
      )
      let newActiveConversationId = activeConversationId
      if (activeConversationId === conversationId) {
        newActiveConversationId =
          updatedConversations.length > 0 ? updatedConversations[0].id : null
      }
      set({
        conversations: updatedConversations,
        activeConversationId: newActiveConversationId,
      })
    },

    readConversation: (conversationId: string) => {
      const { conversations } = get()
      const conversationIndex = conversations.findIndex(
        (c) => c.id === conversationId,
      )

      if (conversationIndex > -1) {
        const updatedConversations = [...conversations]
        const conversation = { ...updatedConversations[conversationIndex] }
        conversation.agentLastReadAt = new Date()

        updatedConversations[conversationIndex] = conversation
        set({ conversations: updatedConversations })
      }
    },

    resetState: () => {
      set({
        isFirstLoadConversation: true,
        conversations: [],
        nextCursorConversation: null,
        isLoadingConversation: false,
        isBootstrappingUrlConversation: false,
        hasNextConversationPage: true,
        activeConversationId: null,

        messages: [],
        nextCursorMessage: null,
        isLoadMoreMessage: false,
        hasNextMessagePage: true,
      })
    },

    setFilters: (filters: ConversationFilters) => {
      set({ filters })
    },

    setAssignee: (value: string | null) => {
      const { conversations, activeConversationId } = get()
      const conversationIndex = conversations.findIndex(
        (c) => c.id === activeConversationId,
      )

      if (conversationIndex > -1) {
        const updatedConversations = [...conversations]
        const conversation = { ...updatedConversations[conversationIndex] }

        try {
          if (value === null) {
            conversation.assignedUser = null
            conversation.assignedUserId = null
            conversation.assignedInboxTeam = null
            conversation.assignedInboxTeamId = null
          } else if (value.startsWith("u_")) {
            const userId = value.slice(2)
            conversation.assignedUserId = userId
            conversation.assignedInboxTeamId = null
          } else if (value.startsWith("t_")) {
            const inboxTeamId = value.slice(2)
            conversation.assignedInboxTeamId = inboxTeamId
            conversation.assignedUserId = null
          }
        } catch {
          //
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
      const { updateConversationViaMessage } = get()
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
      updateConversationViaMessage(message)
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
        })
      } catch (error) {
        // Reset the in-flight flag or the `isLoadMoreMessage` guard above
        // would block every later scroll-up load for this store instance.
        set({ isLoadMoreMessage: false })
        throw error
      }
    },

    updateConversationViaMessage: async (message: MessageResource) => {
      const { conversations, prependConversation } = get()
      const conversationIndex = conversations.findIndex(
        (c) => c.id === message.conversationId,
      )

      if (conversationIndex > -1) {
        // Update existing conversation
        const updatedConversations = [...conversations]
        const conversation = { ...updatedConversations[conversationIndex] }

        // Update the latest message
        conversation.messages = [message]
        conversation.lastActivityAt = message.createdAt

        // Remove conversation from current position
        updatedConversations.splice(conversationIndex, 1)

        // Add to the beginning of the list
        set({ conversations: [conversation, ...updatedConversations] })
      } else {
        // New conversation, we'll need basic details
        const newConversation =
          await client.conversationsAPI.findConversationAuthenticatedAPI({
            workspaceId: message.workspaceId,
            id: message.conversationId,
          })
        newConversation.data.messages = [message]
        prependConversation(newConversation.data)
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
        // Already loaded — splice it out and re-insert at the front, like
        // updateConversationViaMessage, but without touching lastActivityAt or
        // messages since this is a visual-only reorder.
        const updatedConversations = [...conversations]
        const [conversation] = updatedConversations.splice(conversationIndex, 1)
        if (conversation) {
          set({ conversations: [conversation, ...updatedConversations] })
        }
        return
      }

      // Not loaded client-side — fetch and prepend it, mirroring
      // updateConversationViaMessage's not-found branch. A lookup failure is a
      // no-op: the ringing state still lives in the VoIP call store, so the
      // dock and dialog keep working even if the list can't show the row.
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
      const updatedConversations = [...conversations]

      for (const conversationId of conversationIds) {
        const conversationIndex = conversations.findIndex(
          (c) => c.id === conversationId,
        )
        if (conversationIndex > -1) {
          updatedConversations[conversationIndex] = {
            ...updatedConversations[conversationIndex],
            ...data,
          }
        }
      }
      set({ conversations: updatedConversations })
    },

    handleNewMessage: async (message: MessageResourceWithRelations) => {
      const {
        messages,
        activeConversationId,
        appendMessage,
        updateConversationViaMessage,
        updateConversation,
      } = get()

      const conversationPatch = conversationPatchForMessage(
        get().conversations.find((c) => c.id === message.conversationId),
        message,
      )
      if (conversationPatch) {
        updateConversation(message.conversationId, conversationPatch)
      }
      // Only an outgoing message that `createOutgoing` itself produced clears
      // the unread state — a bot/system reply (flow step, template, comment
      // automation) must leave it alone. This mirrors the server exactly:
      // `createOutgoing` is the only writer that calls `markAgentReplied`,
      // and it stamps senderType "user" with a senderId (inbox composer) or
      // "api" with none (public API); the worker handlers that send on the
      // bot's behalf only bump `lastActivityAt`. Without this guard a flow
      // reply broadcast over realtime marked every open inbox tab as read
      // even though nobody had opened the conversation.
      //
      // The senderId check is what excludes a channel echo: `received-message`
      // stamps every outgoing echo senderType "user" with a null senderId
      // whatever its origin (see its `isEchoOfOwnSend` comment), so a bot send
      // whose sourceId dedup missed comes back looking like an agent reply.
      // Echoes never persist a read state server-side either, so honouring
      // them here would only produce a state that reverts on reload.
      const isAgentReply =
        message.messageType === "outgoing" &&
        ((message.senderType === "user" && message.senderId !== null) ||
          message.senderType === "api")
      // An incoming message only counts as read while the agent has that
      // conversation open — and it is never an admin reply, so it must not
      // touch `adminRepliedAt` (that drives the "no admin reply" filter).
      const isReadWhileConversationOpen =
        message.messageType === "incoming" &&
        message.conversationId === activeConversationId

      if (isAgentReply || isReadWhileConversationOpen) {
        const readAt = new Date()
        updateConversation(message.conversationId, {
          agentLastReadAt: readAt,
          ...(isAgentReply ? { adminRepliedAt: readAt } : {}),
        })
      }

      // Update the conversation list
      updateConversationViaMessage(message)

      // Add to messages list if this is the active conversation
      if (message.conversationId !== activeConversationId) {
        return
      }

      // If the message contains the clientId, it can be sent from this tab itself.
      if (message.clientId) {
        const messageIndex = messages.findIndex(
          (m) => m.clientId === message.clientId,
        )

        // let replace the returned content if found
        if (messageIndex > -1) {
          const newMessages = [...messages]
          newMessages[messageIndex] = {
            ...newMessages[messageIndex],
            ...message,
            // messageCreated's payload is captured before the async send job
            // runs, so its sendError is always null at broadcast time — keep
            // a sendError already recorded by markMessageFailed instead of
            // letting this stale snapshot clobber it.
            sendError: newMessages[messageIndex].sendError ?? message.sendError,
          }
          set({
            messages: newMessages,
          })
        } else {
          // New conversation, we'll need basic details
          const newMessage =
            await client.messagesAPI.findMessageAuthenticatedAPI({
              workspaceId: message.workspaceId,
              id: message.id,
              createdAt: new Date(message.createdAt),
            })
          appendMessage(newMessage)
        }
      } else {
        // just append the messages to the end of messages list
        appendMessage(message)
      }
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
  }))
}
