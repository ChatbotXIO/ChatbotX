import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { SequenceResource } from "../schemas/get-sequences-schema"

export type SequenceState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  sequences: SequenceResource[]
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
      const searchParams = new URLSearchParams({
        perPage: "9999999",
        active: "true",
      })
      const { data } = await ky
        .get<{ data: SequenceResource[] }>(
          `/api/chatbots/${chatbotId}/sequences?${searchParams.toString()}`,
        )
        .json()

      set({ sequences: data })
    },
  }))
