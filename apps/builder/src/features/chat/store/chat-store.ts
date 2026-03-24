import type { ConversationStatus } from "@aha.chat/database/enums"
import type { ChannelType } from "@aha.chat/database/types"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { ContactFilterRequest } from "@/features/contacts/schemas/query"
import type { ContactResource } from "@/features/contacts/schemas/resource"
import type {
  ConversationResource,
  FindConversationResponse,
  ListConversationItemResource,
  ListConversationsResponse,
} from "@/features/conversations/schemas/resource"
import type {
  MessageCollection,
  MessageResource,
} from "@/features/messages/schemas"

export type ConversationFilters = {
  assignedUserId?: string
  channel?: ChannelType
  status?: ConversationStatus[]
  keyword?: string
  liveChatEnabled?: boolean
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
  messages: MessageResource[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean
}

export type ChatActions = {
  // Conversation actions
  prependConversation: (newConversation: ListConversationItemResource) => void
  loadMoreConversations: (chatbotId: string) => Promise<void>
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
  appendMessage: (message: MessageResource) => void
  loadMoreMessages: (chatbotId: string, perPage: number) => Promise<void>
  handleNewMessage: (message: MessageResource) => void

  // Contact actions
  updateContact: (contactId: string, data: Partial<ContactResource>) => void
}

export type ChatStore = ChatState & ChatActions

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

    prependConversation: (newConversation: ListConversationItemResource) =>
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
      })),

    loadMoreConversations: async (chatbotId: string) => {
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
          `/api/chatbots/${chatbotId}/conversations/list`,
          { json: searchParams },
        )
        .json()

      const urlParams = new URLSearchParams(window.location.search)
      const queryConversationId = urlParams.get("conversationId")
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

      set({
        conversations: [...conversations, ...newConversations],
        nextCursorConversation: nextCursor,
        isLoadingConversation: false,
        isFirstLoadConversation: false,
      })
    },

    setActiveConversationId: (activeConversationId: string | null) => {
      const { activeConversationId: oldActiveConversationId } = get()
      if (oldActiveConversationId !== activeConversationId) {
        set({ activeConversationId, messages: [], nextCursorMessage: null })
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

        updatedConversations[conversationIndex] = conversation
        set({ conversations: updatedConversations })
      }
    },

    appendMessage: (message: MessageResource) => {
      const { updateConversationViaMessage } = get()
      set((state) => ({
        messages: [...state.messages, message],
      }))

      updateConversationViaMessage(message)
    },

    loadMoreMessages: async (chatbotId: string, perPage: number) => {
      const { isLoadMoreMessage, hasNextMessagePage } = get()
      if (isLoadMoreMessage || !hasNextMessagePage) {
        return
      }

      const { nextCursorMessage, messages, activeConversationId } = get()
      set({ isLoadMoreMessage: true })

      const searchParams = new URLSearchParams({
        perPage: `${perPage}`,
        cursor: nextCursorMessage ?? "",
        conversationId: activeConversationId ?? "",
      })
      const { data, nextCursor } = await ky
        .get<MessageCollection>(`/api/chatbots/${chatbotId}/messages`, {
          searchParams,
        })
        .json()
      set({
        messages: [...data.reverse(), ...messages],
        nextCursorMessage: nextCursor,
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

        // Remove conversation from current position
        updatedConversations.splice(conversationIndex, 1)

        // Add to the beginning of the list
        set({ conversations: [conversation, ...updatedConversations] })
      } else {
        // New conversation, we'll need basic details
        const newConversation = await ky
          .get<FindConversationResponse>(
            `/api/chatbots/${message.chatbotId}/conversations/${message.conversationId}`,
          )
          .json()
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

    handleNewMessage: async (message: MessageResource) => {
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
            .get<MessageResource>(
              `/api/chatbots/${message.chatbotId}/messages/${message.id}`,
            )
            .json()
          appendMessage(newMessage)
        }
      } else {
        // just append the messages to the end of messages list
        appendMessage(message)
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
