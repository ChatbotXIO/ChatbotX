import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { CreateWebchatMessageRequest } from "@/features/messages/schema/mutation"
import type { ListMessagesResponse } from "@/features/messages/schema/query"
import type { MessageResource } from "@/features/messages/schema/resource"
import type { UserResource } from "@/features/users/schemas/resource"
import { getWebchatProfileFields } from "../../browser-profile-fields"
import { getClientEmbeddingOrigin } from "../../lib/authorized-domain"
import {
  buildGuestStorageKey,
  readLegacyGuestId,
  safeStorageGet,
  safeStorageSet,
} from "./lib/guest-session"
import type { WebchatClientConfig } from "./lib/webchat-client-config"

export { GUEST_CONVERSATION_ID_KEY } from "./lib/guest-session"

export type GuestSessionState = {
  // default state
  guestConversationId: string | null
  isNewGuestSession: boolean
  accessToken: string | null
  /**
   * Resolved workspace logo URL, already gated server-side on
   * `config.showLogo` (undefined when the flag is off or no logo is set).
   * Kept as separate store state rather than a `WebchatClientConfig` field
   * so the DTO's allow-listed key set — asserted by
   * webchat-guest-session.test.ts — stays unchanged.
   */
  workspaceLogoUrl?: string
  user: UserResource | null
  config: WebchatClientConfig

  // messages
  messages: MessageResource[]
  nextCursorMessage: string | null
  isLoadMoreMessage: boolean
  hasNextMessagePage: boolean
  isTyping: boolean
}

export type GuestSessionActions = {
  setGuestUser: (user: UserResource) => void
  initGuestSession: (serverGuestConversationId: string) => void

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

export const createGuestSessionStore = (
  props: WebchatClientConfig,
  accessToken: string | null = null,
  workspaceLogoUrl?: string,
) => {
  return createStore<GuestSessionStore>((set, get) => ({
    // default state
    guestConversationId: null,
    isNewGuestSession: false,
    accessToken,
    workspaceLogoUrl,
    user: null,
    config: props,

    // messages related state
    messages: [],
    nextCursorMessage: null,
    isLoadMoreMessage: false,
    hasNextMessagePage: true,

    isTyping: false,

    initGuestSession: (serverGuestConversationId: string) => {
      const { guestConversationId, config } = get()
      if (guestConversationId) {
        return
      }

      const scopedKey = buildGuestStorageKey(config.workspaceId, config.id)
      const scopedGuestId = safeStorageGet(scopedKey)
      if (scopedGuestId) {
        set({ guestConversationId: scopedGuestId, isNewGuestSession: false })
        return
      }

      const legacyGuestId = readLegacyGuestId()
      if (legacyGuestId) {
        safeStorageSet(scopedKey, legacyGuestId)
        set({ guestConversationId: legacyGuestId, isNewGuestSession: false })
        return
      }

      safeStorageSet(scopedKey, serverGuestConversationId)
      set({
        guestConversationId: serverGuestConversationId,
        isNewGuestSession: true,
      })
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
        config,
        accessToken,
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
          workspaceId: config.workspaceId,
          webchatId: config.id,
        })
        const parentOrigin = getClientEmbeddingOrigin()
        if (parentOrigin) {
          params.set("parentOrigin", parentOrigin)
        }

        const { data, nextCursor } = await ky
          .get<ListMessagesResponse>(
            `/api/guest/messages?${params.toString()}`,
            {
              headers: accessToken
                ? { Authorization: `Bearer ${accessToken}` }
                : undefined,
            },
          )
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

      appendMessage({ text })
    },

    sendPostback: async (button: MessageButtonTemplate) => {
      const { appendMessage, config, guestConversationId, accessToken } = get()

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
              ...getWebchatProfileFields(),
              accessToken: accessToken ?? undefined,
              parentOrigin: getClientEmbeddingOrigin() ?? undefined,
            } as CreateWebchatMessageRequest,
            headers: accessToken
              ? { Authorization: `Bearer ${accessToken}` }
              : undefined,
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
        deletedAt: null,
        type: "message",
        parentId: null,
        attributes: null,
        sendError: null,
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
