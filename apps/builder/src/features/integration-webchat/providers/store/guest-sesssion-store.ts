import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { CreateWebchatMessageRequest } from "@/features/messages/schema/mutation"
import type { ListMessagesResponse } from "@/features/messages/schema/query"
import type { MessageResource } from "@/features/messages/schema/resource"
import type { UserResource } from "@/features/users/schema/resource"
import { getWebchatProfileFields } from "../../browser-profile-fields"
import { getClientEmbeddingOrigin } from "../../lib/authorized-domain"
import { isValidGuestConversationId } from "../../lib/guest-conversation-id"
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
  markMessageFailed: (clientId: string, error: string) => void
  sendMessage: (content: string, clientId: string) => void
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
        if (isValidGuestConversationId(scopedGuestId)) {
          set({ guestConversationId: scopedGuestId, isNewGuestSession: false })
          return
        }
        console.warn(
          "Discarding corrupted guest conversation id from storage",
          { scopedKey },
        )
      }

      const legacyGuestId = readLegacyGuestId()
      if (legacyGuestId && isValidGuestConversationId(legacyGuestId)) {
        safeStorageSet(scopedKey, legacyGuestId)
        set({ guestConversationId: legacyGuestId, isNewGuestSession: false })
        return
      }

      // Either nothing was stored, or what was stored failed validation
      // above — in both cases fall back to the id minted by the server for
      // this page load (always valid) and overwrite storage so a corrupted
      // value never persists past the request that detects it.
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

        set((state) => {
          const existingMessageIds = new Set(
            state.messages.map((message) => message.id),
          )
          const olderMessages = [...data]
            .reverse()
            .filter((message) => !existingMessageIds.has(message.id))

          return {
            hasNextMessagePage: Boolean(nextCursor),
            isLoadMoreMessage: false,
            messages: [...olderMessages, ...state.messages],
            nextCursorMessage: nextCursor,
          }
        })
      } catch (error) {
        set({ isLoadMoreMessage: false })
        console.error("Failed to load more messages:", error)
        throw error
      }
    },

    handleNewMessage: (message: MessageResource) => {
      set((state) => {
        if (state.messages.some((current) => current.id === message.id)) {
          return state
        }

        const optimisticMessageIndex = message.clientId
          ? state.messages.findIndex(
              (current) =>
                current.clientId === message.clientId &&
                current.conversationId === "",
            )
          : -1
        if (optimisticMessageIndex === -1) {
          return { messages: [...state.messages, message] }
        }

        return {
          messages: state.messages.map((current, index) =>
            index === optimisticMessageIndex
              ? { ...current, ...message }
              : current,
          ),
        }
      })
    },

    markMessageFailed: (clientId: string, error: string) => {
      set((state) => {
        const optimisticMessageIndex = state.messages.findIndex(
          (message) =>
            message.clientId === clientId && message.conversationId === "",
        )
        if (optimisticMessageIndex === -1) {
          return state
        }

        const messages = [...state.messages]
        messages[optimisticMessageIndex] = {
          ...messages[optimisticMessageIndex],
          sendError: error,
        }
        return { messages }
      })
    },

    sendMessage: (text: string, clientId: string) => {
      const { appendMessage } = get()

      appendMessage({ clientId, text })
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
