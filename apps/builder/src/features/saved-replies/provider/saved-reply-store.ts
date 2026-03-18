import { createStore } from "zustand/vanilla"

export type SavedReplyItem = {
  id: string
  shortcut: string
  message: string
}

export type SavedReplyStoreState = {
  initialized: boolean
  isLoadingSavedReplies: boolean
  savedReplies: SavedReplyItem[]
}

export type SavedReplyStoreActions = {
  removeSavedReply: (id: string) => void
  setLoadingSavedReplies: (isLoadingSavedReplies: boolean) => void
  setSavedReplies: (savedReplies: SavedReplyItem[]) => void
  upsertSavedReply: (savedReply: SavedReplyItem) => void
}

export type SavedReplyStore = SavedReplyStoreState & SavedReplyStoreActions

export const createSavedReplyStore = () =>
  createStore<SavedReplyStore>((set) => ({
    initialized: false,
    isLoadingSavedReplies: false,
    savedReplies: [],

    removeSavedReply: (id) => {
      set((state) => ({
        savedReplies: state.savedReplies.filter((item) => item.id !== id),
      }))
    },
    setLoadingSavedReplies: (isLoadingSavedReplies) => {
      set({ isLoadingSavedReplies })
    },
    setSavedReplies: (savedReplies) => {
      set({ initialized: true, isLoadingSavedReplies: false, savedReplies })
    },
    upsertSavedReply: (savedReply) => {
      set((state) => {
        const existingIndex = state.savedReplies.findIndex(
          (item) => item.id === savedReply.id,
        )

        if (existingIndex === -1) {
          return {
            savedReplies: [savedReply, ...state.savedReplies],
          }
        }

        return {
          savedReplies: state.savedReplies.map((item) =>
            item.id === savedReply.id ? savedReply : item,
          ),
        }
      })
    },
  }))
