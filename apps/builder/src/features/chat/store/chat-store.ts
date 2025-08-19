import ky from "ky"
import { createStore } from "zustand/vanilla"
import type {
  ConversationCollection,
  ConversationResource,
} from "@/features/conversations/schemas"
import type {
  MessageCollection,
  MessageResource,
} from "@/features/messages/schemas"

export type ClientConversationResource = ConversationResource & {
  isActive: boolean
}

export type ChatState = {
  // conversation list
  conversations: ClientConversationResource[]
  nextCursorConversation: string | null
  isLoadingConversation: boolean
  activeConversationId: string | null
  hasNextConversationPage: boolean

  // message list
  messages: MessageResource[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean
}

export type ChatActions = {
  prependConversation: (newConversation: ClientConversationResource) => void
  loadMoreConversations: (chatbotId: string) => Promise<void>
  setActiveConversationId: (activeConversationId: string | null) => void
  appendMessage: (message: MessageResource) => void
  loadMoreMessages: (chatbotId: string, perPage: number) => Promise<void>
  updateConversationViaMessage: (message: MessageResource) => void
  handleNewMessage: (message: MessageResource) => void
}

export type ChatStore = ChatState & ChatActions

export const createChatStore = () => {
  return createStore<ChatStore>((set, get) => ({
    // default conversation state
    conversations: [],
    nextCursorConversation: null,
    isLoadingConversation: false,
    hasNextConversationPage: true,
    activeConversationId: null,

    // default message state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,

    prependConversation: (newConversation: ClientConversationResource) =>
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
      })),

    loadMoreConversations: async (chatbotId: string) => {
      const { isLoadingConversation, hasNextConversationPage } = get()
      if (isLoadingConversation || !hasNextConversationPage) {
        return
      }

      // fetch next conversation list
      const { conversations, nextCursorConversation, activeConversationId } =
        get()
      set({ isLoadingConversation: true })

      const params = new URLSearchParams({
        perPage: "20",
        cursor: nextCursorConversation ?? "",
      })
      const { data, nextCursor } = await ky
        .get<ConversationCollection>(
          `/api/chatbots/${chatbotId}/conversations?${params.toString()}`,
        )
        .json()

      const newConversations = (data as ClientConversationResource[]).map(
        (conversation) => {
          conversation.isActive = false
          return conversation
        },
      )

      // set active conversationId
      if (!activeConversationId && newConversations.length > 0) {
        const firstConversation =
          newConversations[0] as ClientConversationResource
        firstConversation.isActive = true

        set({ activeConversationId: firstConversation.id })
      }

      set({
        conversations: [...conversations, ...newConversations],
        nextCursorConversation: nextCursor,
        isLoadingConversation: false,
      })
    },

    setActiveConversationId: (activeConversationId: string | null) => {
      const { activeConversationId: oldActiveConversationId } = get()
      if (oldActiveConversationId !== activeConversationId) {
        set({ activeConversationId, messages: [], nextCursorMessage: null })
      }
    },

    appendMessage: (message: MessageResource) => {
      set((state) => ({
        messages: [...state.messages, message],
      }))
    },

    loadMoreMessages: async (chatbotId: string, perPage: number) => {
      const { isLoadMoreMessage, hasNextMessagePage } = get()
      if (isLoadMoreMessage || !hasNextMessagePage) {
        return
      }

      const { nextCursorMessage, messages, activeConversationId } = get()
      set({ isLoadMoreMessage: true })

      const params = new URLSearchParams({
        perPage: `${perPage}`,
        cursor: nextCursorMessage ?? "",
        conversationId: activeConversationId ?? "",
      })
      const { data, nextCursor } = await ky
        .get<MessageCollection>(
          `/api/chatbots/${chatbotId}/messages?${params.toString()}`,
        )
        .json()
      set({
        messages: [...data.reverse(), ...messages],
        nextCursorMessage: nextCursor,
        isLoadMoreMessage: false,
      })
    },

    updateConversationViaMessage: async (message: MessageResource) => {
      const { conversations, activeConversationId, prependConversation } = get()
      const conversationIndex = conversations.findIndex(
        (c) => c.id === message.conversationId,
      )

      if (conversationIndex > -1) {
        // Update existing conversation
        const updatedConversations = [...conversations]
        const conversation = { ...updatedConversations[conversationIndex] }

        // Update the latest message
        conversation.messages = [message]
        conversation.lastActivityAt = new Date()
        conversation.agentLastSeenAt = new Date()

        // Handle unread count
        if (conversation.id !== activeConversationId) {
          if (!conversation._count) {
            conversation._count = { messages: 1 }
          }
          conversation._count.messages = (conversation._count.messages || 0) + 1
        }

        // Remove conversation from current position
        updatedConversations.splice(conversationIndex, 1)

        // Add to the beginning of the list
        set({ conversations: [conversation, ...updatedConversations] })
      } else {
        // New conversation, we'll need basic details
        const newConversation = await ky
          .get<{ data: ConversationResource }>(
            `/api/chatbots/${message.chatbotId}/conversations/${message.conversationId}`,
          )
          .json()
        newConversation.data.messages = [message]
        prependConversation({ ...newConversation.data, isActive: true })
      }
    },

    handleNewMessage: async (message: MessageResource) => {
      const {
        messages,
        activeConversationId,
        appendMessage,
        updateConversationViaMessage,
      } = get()

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
  }))
}
