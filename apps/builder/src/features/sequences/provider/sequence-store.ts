import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListSequencesItem, ListSequencesResponse } from "../schema"

export type SequenceState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  sequences: ListSequencesItem[]
}

export type SequenceActions = {
  initialize: () => void
  getAllActiveSequences: (chatbotId: string) => void
}

export type SequenceStore = SequenceState & SequenceActions

export const createSequenceStore = (props: Partial<SequenceState> = {}) =>
  createStore<SequenceStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    sequences: [],
    ...props,

    initialize: async () => {
      const { initialized, chatbotId } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAllActiveSequences(chatbotId)
        set({
          loading: false,
          initialized: true,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch sequences",
            loading: false,
          })
        }
      }
    },

    getAllActiveSequences: async (chatbotId: string) => {
      const { data } = await ky
        .get<ListSequencesResponse>(`/api/chatbots/${chatbotId}/sequences`, {
          searchParams: {
            perPage: maxPerPageString,
            active: "true",
          },
        })
        .json()

      set({ sequences: data })
    },
  }))
