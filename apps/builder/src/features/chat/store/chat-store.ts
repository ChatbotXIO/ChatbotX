import type {
  ChannelType,
  ConversationBotCategory,
  ConversationStatus,
} from "@chatbotx.io/database/partials"
import type { FacebookPostDetails } from "@chatbotx.io/integration-messenger/apis/post"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { ContactFilterRequest } from "@/features/contacts/schemas/contact-filter"
import type { ContactResource } from "@/features/contacts/schemas/resource"
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

export type ChatState = {
  // conversation list
  isFirstLoadConversation: boolean
  conversations: ListConversationsResponse["data"]
  nextCursorConversation: string | null
  isLoadingConversation: boolean
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

  // active facebook post (for comment conversations)
  activePost: FacebookPostDetails | null
}

export type ChatActions = {
  // Conversation actions
  prependConversation: (newConversation: ListConversationItemResource) => void
  loadMoreConversations: (workspaceId: string) => Promise<void>
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
  setReplyToMessage: (message: MessageResourceWithRelations | null) => void

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

export const createChatStore = () => {
  return createStore<ChatStore>((set, get) => ({
    // default conversation state
    isFirstLoadConversation: true,
    conversations: [],
    nextCursorConversation: null,
    isLoadingConversation: false,
    hasNextConversationPage: true,
    activeConversationId: null,
    filters: {},

    // default message state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,
    replyToMessage: null,
    activePost: null,

    prependConversation: (newConversation: ListConversationItemResource) =>
      set((state) => ({
        conversations: [
          newConversation,
          ...state.conversations.filter((c) => c.id !== newConversation.id),
        ],
      })),

    loadMoreConversations: async (workspaceId: string) => {
      const { isLoadingConversation, hasNextConversationPage } = get()
      if (isLoadingConversation || !hasNextConversationPage) {
        return
      }

      // fetch next conversation list
      const {
        conversations,
        nextCursorConversation,
        activeConversationId,
        filters,
      } = get()
      set({ isLoadingConversation: true })

      const searchParams = {
        perPage: "20",
        cursor: nextCursorConversation ?? "",
        ...filters,
      }
      const { data: newConversations, nextCursor } = await ky
        .post<ListConversationsResponse>(
          `/api/workspaces/${workspaceId}/conversations/list`,
          { json: searchParams },
        )
        .json()

      const urlParams = new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      )
      try {
        const queryConversationId = urlParams.get("conversationId") ?? ""
        if (!activeConversationId && newConversations.length > 0) {
          if (queryConversationId) {
            const found = newConversations.find(
              (c) => c.id === queryConversationId,
            )
            if (found) {
              set({ activeConversationId: queryConversationId })
            }
          } else {
            set({
              activeConversationId: newConversations[0].id,
            })
          }
        }
      } catch {
        //
      }

      set({
        conversations: appendUniqueConversations(
          conversations,
          newConversations,
        ),
        nextCursorConversation: nextCursor,
        isLoadingConversation: false,
        isFirstLoadConversation: false,
      })
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

    setReplyToMessage: (message) => set({ replyToMessage: message }),

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
        updateConversation(message.conversationId, {
          contactRepliedAt: message.createdAt,
          contactLastReadAt: message.createdAt,
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
          }
          set({
            messages: newMessages,
          })
        } else {
          // New conversation, we'll need basic details
          const newMessage = await ky
            .get<MessageResourceWithRelations>(
              `/api/workspaces/${message.workspaceId}/messages/${message.id}`,
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
        contactInbox?.channel !== "messenger" ||
        !contactInbox?.inboxId
      ) {
        set({ activePost: null })
        return
      }

      try {
        const post = await ky
          .get<FacebookPostDetails>(
            `/api/workspaces/${workspaceId}/conversations/post-details`,
            {
              searchParams: {
                inboxId: contactInbox.inboxId,
                postId: conversation.sourceId,
              },
            },
          )
          .json()
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
