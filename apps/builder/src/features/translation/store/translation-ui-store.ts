import { create } from "zustand"

/**
 * Client-only state of "I asked for this message to be translated": the
 * answer itself lives on the message in the chat store (it arrives as a
 * realtime event or in `messages.list`). Never server data, so not TanStack
 * Query.
 */
type TranslationRequestEntry = {
  state: "pending" | "waiting"
}

/**
 * An agent's message sent with translation, by its `clientId`: `translating`
 * while the server waits for the translation, `failed` when it could not be
 * translated and was not sent. Tab-only, like the composer's send queue.
 */
export type OutgoingTranslationStatus = "translating" | "failed"

type TranslationUiState = {
  entries: Record<string, TranslationRequestEntry>
  outgoing: Record<string, OutgoingTranslationStatus>
  /** `null` clears it (the message was sent, or failed for another reason). */
  setOutgoingStatus: (
    clientIds: string[],
    status: OutgoingTranslationStatus | null,
  ) => void
  /**
   * Whether a conversation shows the original text under every translated
   * message ("Show original text" in its menu). Off by default; lives only in
   * this tab, like the open/closed state of one message below.
   */
  showAllOriginals: Record<string, boolean>
  /** A message the agent opened or closed by hand, by conversation: beats the conversation setting. */
  originalOverrides: Record<string, Record<string, boolean>>
  setShowAllOriginals: (conversationId: string, show: boolean) => void
  setOriginalOpen: (
    conversationId: string,
    messageId: string,
    open: boolean,
  ) => void
  markRequested: (ids: string[]) => void
  markWaiting: (ids: string[]) => void
  clear: (ids: string[]) => void
}

export const useTranslationUiStore = create<TranslationUiState>((set) => ({
  entries: {},
  outgoing: {},
  setOutgoingStatus: (clientIds, status) =>
    set((state) => {
      const outgoing = { ...state.outgoing }
      for (const clientId of clientIds) {
        if (status === null) {
          delete outgoing[clientId]
        } else {
          outgoing[clientId] = status
        }
      }
      return { outgoing }
    }),
  showAllOriginals: {},
  originalOverrides: {},
  // A new conversation-wide choice replaces what was opened or closed by hand.
  setShowAllOriginals: (conversationId, show) =>
    set((state) => {
      const { [conversationId]: _dropped, ...originalOverrides } =
        state.originalOverrides
      return {
        showAllOriginals: { ...state.showAllOriginals, [conversationId]: show },
        originalOverrides,
      }
    }),
  setOriginalOpen: (conversationId, messageId, open) =>
    set((state) => ({
      originalOverrides: {
        ...state.originalOverrides,
        [conversationId]: {
          ...state.originalOverrides[conversationId],
          [messageId]: open,
        },
      },
    })),
  markRequested: (ids) =>
    set((state) => {
      const entries = { ...state.entries }
      for (const id of ids) {
        entries[id] = { state: "pending" }
      }
      return { entries }
    }),
  markWaiting: (ids) =>
    set((state) => {
      const entries = { ...state.entries }
      let changed = false
      for (const id of ids) {
        const entry = entries[id]
        if (entry?.state === "pending") {
          entries[id] = { ...entry, state: "waiting" }
          changed = true
        }
      }
      return changed ? { entries } : state
    }),
  clear: (ids) =>
    set((state) => {
      if (!ids.some((id) => id in state.entries)) {
        return state
      }
      const entries = { ...state.entries }
      for (const id of ids) {
        delete entries[id]
      }
      return { entries }
    }),
}))
