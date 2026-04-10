import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListSavedReplyResponse } from "../schema/mutation"
import type { SavedReplyResource } from "../schema/resource"

export type SavedReplyStoreState = {
  initialized: boolean
  isLoading: boolean
  workspaceId: string
  savedReplies: SavedReplyResource[]
  error: string | null
}

export type SavedReplyStoreActions = {
  initialize: () => Promise<void>
  getAllSavedReplies: () => Promise<void>
  deleteSavedReply: (id: string) => void
  upsertSavedReply: (savedReply: SavedReplyResource) => void
}

export type SavedReplyStore = SavedReplyStoreState & SavedReplyStoreActions

export const createSavedReplyStore = (props: Partial<SavedReplyStoreState>) =>
  createStore<SavedReplyStore>((set, get) => ({
    initialized: false,
    isLoading: false,
    savedReplies: [],
    workspaceId: "",
    error: null,

    ...props,

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
      const { isLoading, workspaceId } = get()

      // Skip if already initialized for the same workspaceId or currently loading
      if (isLoading) {
        return
      }

      set({ isLoading: true })

      try {
        const { data } = await ky
          .get<ListSavedReplyResponse>(
            `/api/workspaces/${workspaceId}/saved-replies`,
            {
              searchParams: {
                perPage: maxPerPageString,
              },
            },
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
        set({ isLoading: false })
      }
    },

    deleteSavedReply: (id) => {
      set((state) => ({
        savedReplies: state.savedReplies.filter((item) => item.id !== id),
      }))
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
