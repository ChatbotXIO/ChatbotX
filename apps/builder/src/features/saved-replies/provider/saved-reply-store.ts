import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { SavedReplyResource } from "../queries"

export type SavedReplyItem = {
  id: string
  shortcut: string
  text: string
}

export type SavedReplyStoreState = {
  initialized: boolean
  isLoadingSavedReplies: boolean
  savedReplies: SavedReplyItem[]
  error: string | null
}

export type SavedReplyStoreActions = {
  initialize: () => Promise<void>
  getAllSavedReplies: () => Promise<void>
  removeSavedReply: (id: string) => void
  setLoadingSavedReplies: (isLoadingSavedReplies: boolean) => void
  setSavedReplies: (savedReplies: SavedReplyItem[]) => void
  upsertSavedReply: (savedReply: SavedReplyItem) => void
}

export type SavedReplyStore = SavedReplyStoreState & SavedReplyStoreActions

export const createSavedReplyStore = () =>
  createStore<SavedReplyStore>((set, get) => ({
    initialized: false,
    isLoadingSavedReplies: false,
    savedReplies: [],
    error: null,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllSavedReplies()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch saved replies",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllSavedReplies: async () => {
      const { isLoadingSavedReplies } = get()

      // Skip if already initialized for the same chatbotId or currently loading
      if (isLoadingSavedReplies) {
        return
      }

      set({ isLoadingSavedReplies: true })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
        })
        const data = await ky
          .get<SavedReplyResource[]>(
            `/api/saved-replies?${searchParams.toString()}`,
          )
          .json()

        set({
          savedReplies: data,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch saved replies",
        })
      } finally {
        set({ isLoadingSavedReplies: false })
      }
    },

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
