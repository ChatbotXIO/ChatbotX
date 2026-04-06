import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import type { IntegrationWebchatModel } from "@chatbotx.io/database/types"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { CreateWebchatMessageRequest } from "@/features/messages/schema/mutation"
import type { ListMessagesResponse } from "@/features/messages/schema/query"
import type { MessageResource } from "@/features/messages/schema/resource"
import type { UserResource } from "@/features/users/schemas/resource"

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
  isTyping: boolean
}

export type GuestSessionActions = {
  setGuestUser: (user: UserResource) => void
  initGuestSession: () => void

  // messages
  appendMessage: (message: Partial<MessageResource>) => MessageResource
  loadMoreMessages: (
    guestConversationId: string,
    perPage: number,
  ) => Promise<void>
  handleNewMessage: (message: MessageResource) => void
  sendMessage: (content: string) => void
  sendPostback: (button: MessageButtonTemplate) => Promise<void>
  setIsTyping: (isTyping: boolean) => void

  getMenus: () => WebchatPersistentMenu[]
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

    isTyping: false,

    initGuestSession: () => {
      const { guestConversationId } = get()
      if (guestConversationId) {
        return
      }

      let guestId = localStorage.getItem(GUEST_CONVERSATION_ID_KEY)
      if (!guestId) {
        guestId = createId()
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
          .get<ListMessagesResponse>(`/api/guest/messages?${params.toString()}`)
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
      const { messages, appendMessage } = get()

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
      appendMessage(message)
    },

    sendMessage: (text: string) => {
      const { appendMessage } = get()

      appendMessage({
        text,
      })
    },

    sendPostback: async (button: MessageButtonTemplate) => {
      const { appendMessage, config, guestConversationId } = get()

      const newMessage = appendMessage({
        text: button.label,
      })

      await Promise.resolve()

      try {
        if (button.buttonType === "postback") {
          await ky.post("/api/guest/messages", {
            json: {
              text: button.label,
              postback: button.postback,
              workspaceId: config.workspaceId,
              guestConversationId,
              clientId: newMessage.clientId,
              webchatId: config.id,
            } as CreateWebchatMessageRequest,
          })
        }
      } catch (error) {
        console.error("Failed to send postback:", error)
        throw error
      }
    },

    appendMessage: (message: Partial<MessageResource>) => {
      const newMessage: MessageResource = {
        id: createId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        workspaceId: props.workspaceId,
        // inboxId: props.inboxId,
        sourceId: null,
        conversationId: "",
        text: null,
        contentAttributes: null,
        messageType: "incoming",
        contentType: "text",
        senderType: "contact",
        senderId: "",
        clientId: createId(),
        contactInboxId: "",
        ...message,
      }

      set((state) => ({
        messages: [...state.messages, newMessage],
      }))

      return newMessage
    },

    getMenus: () => {
      const { config } = get()
      return config.persistentMenus ?? []
    },

    setIsTyping: (isTyping: boolean) => {
      set({ isTyping })
    },
  }))
}
