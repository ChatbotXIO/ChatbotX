import type {
  ChannelType,
  ConversationBotCategory,
  ConversationStatus,
} from "@chatbotx.io/database/partials"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { ContactFilterRequest } from "@/features/contact-filter/schema"
import type { ContactResource } from "@/features/contacts/schema/resource"
import type { PostDetails } from "@/features/conversations/schema/query"
import type {
  ConversationResource,
  ListConversationItemResource,
  ListConversationsResponse,
} from "@/features/conversations/schema/resource"
import type { ListMessagesResponse } from "@/features/messages/schema/query"
import type {
  MessageResource,
  MessageResourceWithRelations,
} from "@/features/messages/schema/resource"
import { client } from "@/lib/orpc/orpc"

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

      const {
        activeConversationId,
        isBootstrappingUrlConversation,
        prependConversation,
        setActiveConversationId,
      } = get()
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

        const { conversations: latestConversations } = get()
        const loadedConversation = latestConversations.find(
          (conversation) => conversation.id === conversationId,
        )
        if (loadedConversation) {
          prependConversation(loadedConversation)
          setActiveConversationId(conversationId)
          return
        }

        const response =
          await client.conversationsAPI.findConversationAuthenticatedAPI({
            workspaceId,
            id: conversationId,
          })
        prependConversation(response.data)
        setActiveConversationId(conversationId)
      } catch {
        //
      } finally {
        set({ isBootstrappingUrlConversation: false })
      }
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
      set({ isLoadingConversation: true })

      try {
        const { data: newConversations, nextCursor } = await ky
          .post<ListConversationsResponse>(
            `/api/workspaces/${workspaceId}/conversations/list`,
            {
              json: {
                perPage: "20",
                cursor: nextCursorConversation ?? "",
                ...filters,
              },
              // Default ky timeout (10s) is too tight for this endpoint: it
              // fans out into per-conversation sharded message lookups, which
              // can legitimately take longer under cold caches or dev-server
              // recompiles, so a stricter timeout was tripping spuriously.
              timeout: 30_000,
            },
          )
          .json()

        const hasUrlConversationId =
          shouldRespectUrlConversationId && hasConversationIdInUrl()
        const firstConversationToOpen = shouldAutoSelectConversation({
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

      const { data, nextCursor } = await ky
        .get<ListMessagesResponse>(`/api/workspaces/${workspaceId}/messages`, {
          searchParams: {
            perPage,
            cursor: nextCursorMessage ?? "",
            conversationId: activeConversationId ?? "",
          },
        })
        .json()
      set({
        messages: [...data.reverse(), ...messages],
        nextCursorMessage: nextCursor,
        hasNextMessagePage: nextCursor !== null,
        isLoadMoreMessage: false,
      })
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

      // Update last seen timestamps
      if (message.messageType === "incoming") {
        const currentConversation = get().conversations.find(
          (c) => c.id === message.conversationId,
        )
        const updatedContactInboxes = currentConversation?.contactInboxes?.map(
          (ci, i) =>
            i === 0 ? { ...ci, lastIncomingMessageAt: message.createdAt } : ci,
        )
        updateConversation(message.conversationId, {
          contactRepliedAt: message.createdAt,
          contactLastReadAt: message.createdAt,
          ...(updatedContactInboxes
            ? { contactInboxes: updatedContactInboxes }
            : {}),
        })
      }
      if (
        message.messageType === "outgoing" ||
        (message.messageType === "incoming" &&
          message.conversationId === activeConversationId)
      ) {
        updateConversation(message.conversationId, {
          agentLastReadAt: new Date(),
          adminRepliedAt: new Date(),
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
          const newMessage = await ky
            .get<MessageResourceWithRelations>(
              `/api/workspaces/${message.workspaceId}/messages/${message.id}`,
              {
                searchParams: {
                  createdAt: new Date(message.createdAt).toISOString(),
                },
              },
            )
            .json()
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

      if (
        !conversation?.sourceId ||
        (contactInbox?.channel !== "messenger" &&
          contactInbox?.channel !== "instagram") ||
        !contactInbox?.inboxId
      ) {
        set({ activePost: null })
        return
      }

      try {
        const post =
          await client.conversationsAPI.getPostDetailsAuthenticatedAPI({
            workspaceId,
            inboxId: contactInbox.inboxId,
            postId: conversation.sourceId,
            channel: contactInbox.channel,
          })
        set({ activePost: post })
      } catch {
        set({ activePost: null })
      }
    },

    updateContact: (contactId: string, data: Partial<ContactResource>) => {
      const { conversations } = get()
      const conversationIndex = conversations.findIndex(
        (c) => c.contactId === contactId,
      )
      if (conversationIndex > -1) {
        const updatedConversations = [...conversations]
        if (updatedConversations[conversationIndex].contact) {
          updatedConversations[conversationIndex].contact = {
            ...updatedConversations[conversationIndex].contact,
            ...data,
          }
        }

        set({ conversations: updatedConversations })
      }
    },
  }))
}
