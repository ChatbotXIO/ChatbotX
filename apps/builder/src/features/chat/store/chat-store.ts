import type {
  ConversationCollection,
  ConversationResource,
} from "@/features/conversations/schemas/get-conversations.schema"
import type {
  MessageCollection,
  MessageResource,
} from "@/features/messages/schemas/list-messages.schema"
import ky from "ky"
import { createStore } from "zustand/vanilla"

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
      if (isLoadingConversation || !hasNextConversationPage) return

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
      if (isLoadMoreMessage || !hasNextMessagePage) return

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
  }))
}
