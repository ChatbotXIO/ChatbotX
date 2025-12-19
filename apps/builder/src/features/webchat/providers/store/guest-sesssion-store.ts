import {
  type IntegrationWebchatModel,
  WEBCHAT_SOURCE_PREFIX,
} from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type {
  MessageCollection,
  MessageResource,
} from "@/features/messages/schemas"
import type { UserResource } from "@/features/users/schemas/resource"
import type { PersistentMenuSchema } from "../../schemas/webchat.schema"

export const GUEST_CONVERSATION_ID_KEY = "x-conversation-id" as const

export type GuestSessionState = {
  // default state
  guestConversationId: string | null
  user: UserResource | null
  config: IntegrationWebchatModel

  // messages
  messages: MessageResource[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean
}

export type GuestSessionActions = {
  setGuestUser: (user: UserResource) => void
  initGuestSession: () => void

  // messages
  appendMessage: (message: MessageResource) => void
  loadMoreMessages: (
    guestConversationId: string,
    perPage: number,
  ) => Promise<void>
  handleNewMessage: (message: MessageResource) => void

  getMenus: () => PersistentMenuSchema[]
}

export type GuestSessionStore = GuestSessionState & GuestSessionActions

export const createGuestSessionStore = (props: IntegrationWebchatModel) => {
  return createStore<GuestSessionStore>((set, get) => ({
    // default state
    guestConversationId: null,
    user: null,
    config: props,

    // messages related state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,

    initGuestSession: () => {
      const { guestConversationId } = get()
      if (guestConversationId) {
        return
      }

      let guestId = localStorage.getItem(GUEST_CONVERSATION_ID_KEY)
      if (!guestId) {
        guestId = `${WEBCHAT_SOURCE_PREFIX}${createId()}`
        localStorage.setItem(GUEST_CONVERSATION_ID_KEY, guestId)
      }
      set({ guestConversationId: guestId })
    },

    setGuestUser: (user: UserResource) => {
      set({ user })
    },

    loadMoreMessages: async (guestConversationId: string, perPage: number) => {
      const {
        isLoadMoreMessage,
        hasNextMessagePage,
        nextCursorMessage,
        messages,
      } = get()

      if (isLoadMoreMessage || !hasNextMessagePage) {
        return
      }

      set({ isLoadMoreMessage: true })

      try {
        const params = new URLSearchParams({
          perPage: `${perPage}`,
          cursor: nextCursorMessage ?? "",
          guestConversationId,
        })

        const { data, nextCursor } = await ky
          .get<MessageCollection>(`/api/guest/messages?${params.toString()}`)
          .json()

        set({
          messages: [...data.reverse(), ...messages],
          nextCursorMessage: nextCursor,
          hasNextMessagePage: Boolean(nextCursor),
          isLoadMoreMessage: false,
        })
      } catch (error) {
        set({ isLoadMoreMessage: false })
        console.error("Failed to load more messages:", error)
        throw error
      }
    },

    handleNewMessage: (message: MessageResource) => {
      const { messages } = get()

      // If the message contains the clientId, it can be sent from this tab itself.
      if (message.clientId) {
        const messageIndex = messages.findIndex(
          (m) => m.clientId === message.clientId,
        )

        if (messageIndex > -1) {
          // Replace the existing message with the updated one
          set({
            messages: messages.map((m, idx) =>
              idx === messageIndex ? { ...m, ...message } : m,
            ),
          })
          return
        }
      }

      // Append the message to the end of messages list
      set((state) => ({
        messages: [...state.messages, message],
      }))
    },

    appendMessage: (message: MessageResource) => {
      set((state) => ({
        messages: [...state.messages, message],
      }))
    },

    getMenus: () => {
      const { config } = get()
      return (config.persistentMenus ?? []) as PersistentMenuSchema[]
    },
  }))
}
