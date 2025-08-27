import { CHAT_WIDGET_SOURCE_PREFIX } from "@aha.chat/database/types"
import { createId } from "@paralleldrive/cuid2"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type {
  MessageCollection,
  MessageResource,
} from "@/features/messages/schemas"
import type { UserResource } from "@/features/users/schemas"

export type GuestSessionState = {
  // default state
  guestConversationId: string | null
  user: UserResource | null

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
}

export type GuestSessionStore = GuestSessionState & GuestSessionActions

export const createGuestSessionStore = () => {
  return createStore<GuestSessionStore>((set, get) => ({
    // default state
    guestConversationId: null,
    user: null,

    // messages related state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,

    initGuestSession: () => {
      const { guestConversationId } = get()

      // Set guest user id if not set
      if (!guestConversationId) {
        const key = "x-conversation-id"
        let guestId = localStorage.getItem(key)
        if (!guestId) {
          guestId = `${CHAT_WIDGET_SOURCE_PREFIX}${createId()}`
          localStorage.setItem(key, guestId)
        }
        set({ guestConversationId: guestId })
      }
    },

    setGuestUser: (user: UserResource) => set({ user }),

    loadMoreMessages: async (guestConversationId: string, perPage: number) => {
      const { isLoadMoreMessage, hasNextMessagePage } = get()
      if (isLoadMoreMessage || !hasNextMessagePage) {
        return
      }

      const { nextCursorMessage, messages } = get()
      set({ isLoadMoreMessage: true })

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
        isLoadMoreMessage: false,
      })
    },

    handleNewMessage: (message: MessageResource) => {
      const { messages, appendMessage } = get()

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
          appendMessage(message)
        }
      } else {
        // just append the messages to the end of messages list
        appendMessage(message)
      }
    },

    appendMessage: (message: MessageResource) => {
      set((state) => ({
        messages: [...state.messages, message],
      }))
    },
  }))
}
