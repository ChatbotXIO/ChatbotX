import type { WebchatPersistentMenu } from "@chatbotx.io/database/partials"
import type { MessageButtonTemplate } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import ky from "ky"
import { createStore } from "zustand/vanilla"
import type { CreateWebchatMessageRequest } from "@/features/messages/schema/mutation"
import { listMessagesResponse } from "@/features/messages/schema/query"
import type { MessageResource } from "@/features/messages/schema/resource"
import type { UserResource } from "@/features/users/schema/resource"
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

  /**
   * Realtime socket lifecycle. `"closed"` means either of two things:
   * - The realtime-token mint came back 401/403 (see webchat-realtime.tsx):
   *   re-minting with the same access token will never succeed, and
   *   `RealtimeSocket` has given up reconnecting entirely — genuinely
   *   terminal.
   * - A sustained non-fatal outage (several consecutive failed
   *   connects, or too long without a single successful open): the socket
   *   is still quietly retrying in the background, but the widget stops
   *   claiming "connecting" after that long. A later successful reconnect
   *   flips this back to `"open"` on its own.
   * Either way, the widget should tell the guest the connection is down
   * rather than appearing to silently stop responding.
   */
  connectionStatus: "connecting" | "open" | "closed"
}

export type GuestSessionActions = {
  setGuestUser: (user: UserResource) => void
  initGuestSession: (serverGuestConversationId: string) => void
  setConnectionStatus: (status: GuestSessionState["connectionStatus"]) => void

  // messages
  appendMessage: (message: Partial<MessageResource>) => MessageResource
  loadMoreMessages: (
    guestConversationId: string,
    perPage: number,
  ) => Promise<void>
  refetchLatestMessages: (perPage: number) => Promise<void>
  handleNewMessage: (message: MessageResource) => void
  sendMessage: (content: string) => void
  sendPostback: (button: MessageButtonTemplate) => Promise<void>
  setIsTyping: (isTyping: boolean) => void

  getMenus: () => WebchatPersistentMenu[]
}

export type GuestSessionStore = GuestSessionState & GuestSessionActions

type FetchGuestMessagesPageArgs = {
  accessToken: string | null
  config: WebchatClientConfig
  cursor: string
  guestConversationId: string
  perPage: number
}

const fetchGuestMessagesPage = async ({
  accessToken,
  config,
  cursor,
  guestConversationId,
  perPage,
}: FetchGuestMessagesPageArgs) => {
  const params = new URLSearchParams({
    perPage: `${perPage}`,
    cursor,
    guestConversationId,
    workspaceId: config.workspaceId,
    webchatId: config.id,
  })
  const parentOrigin = getClientEmbeddingOrigin()
  if (parentOrigin) {
    params.set("parentOrigin", parentOrigin)
  }

  const raw = await ky
    .get(`/api/guest/messages?${params.toString()}`, {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    })
    .json()
  return listMessagesResponse.parse(raw)
}

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
    connectionStatus: "connecting",

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

      // Only the `<workspaceId>:<uuid>` legacy global-key form is safe to
      // reuse here. A digits-only legacy id carries no proof of which
      // *caller* it belongs to (see guest-conversation-id.ts), and the
      // realtime-token route now refuses to mint tokens for it — so reusing
      // it would just leave the guest unable to connect. Fall through to
      // mint a fresh id instead of returning early.
      const legacyGuestId = readLegacyGuestId()
      if (legacyGuestId?.includes(":")) {
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

    setConnectionStatus: (connectionStatus) => {
      set({ connectionStatus })
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
        const { data, nextCursor } = await fetchGuestMessagesPage({
          accessToken,
          config,
          cursor: nextCursorMessage ?? "",
          guestConversationId,
          perPage,
        })
        const pageMessages: MessageResource[] = [...data]

        set({
          messages: pageMessages.reverse().concat(messages),
          nextCursorMessage: nextCursor,
          hasNextMessagePage: Boolean(nextCursor),
          isLoadMoreMessage: false,
        })
      } catch (error) {
        set({ isLoadMoreMessage: false })
        throw error
      }
    },

    refetchLatestMessages: async (perPage: number) => {
      const { guestConversationId, config, accessToken } = get()
      if (!guestConversationId) {
        return
      }
      const { data } = await fetchGuestMessagesPage({
        accessToken,
        config,
        cursor: "",
        guestConversationId,
        perPage,
      })

      // Only append messages the socket hasn't already delivered — this
      // recovers the common "missed a few messages during a brief
      // reconnect" gap, not a true replay: a gap wider than one page of
      // history still isn't fully backfilled (the guest socket has no
      // stream cursor to resume from, unlike the workspace socket).
      set((state) => {
        const messages = [...state.messages]
        const messageIndexById = new Map(
          messages.map((message, index) => [message.id, index]),
        )
        const messageIndexByClientId = new Map(
          messages.flatMap((message, index) =>
            message.clientId ? [[message.clientId, index] as const] : [],
          ),
        )
        for (const message of [...data].reverse()) {
          const matchingClientMessageIndex = message.clientId
            ? messageIndexByClientId.get(message.clientId)
            : undefined
          if (matchingClientMessageIndex !== undefined) {
            const currentMessage = messages[matchingClientMessageIndex]
            messages[matchingClientMessageIndex] = {
              ...currentMessage,
              ...message,
            }
            messageIndexById.delete(currentMessage.id)
            messageIndexById.set(message.id, matchingClientMessageIndex)
            continue
          }
          if (messageIndexById.has(message.id)) {
            continue
          }
          messageIndexById.set(message.id, messages.length)
          if (message.clientId) {
            messageIndexByClientId.set(message.clientId, messages.length)
          }
          messages.push(message)
        }
        return {
          messages: messages.sort(
            (left, right) =>
              left.createdAt.getTime() - right.createdAt.getTime(),
          ),
        }
      })
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

      // Second line of defence against a duplicate delivery (e.g. a guest
      // socket's replay window overlapping its live subscription): don't
      // render a server message id that is already in the list.
      if (
        message.id &&
        messages.some((existing) => existing.id === message.id)
      ) {
        return
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
