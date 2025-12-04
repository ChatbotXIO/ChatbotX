import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { TagCollection, TagResource } from "../schemas/resource"

export type TagState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  tags: TagResource[]
}

export type TagActions = {
  initialize: () => Promise<void>
  getAllActiveTags: (chatbotId: string) => Promise<void>
}

export type TagStore = TagState & TagActions

export const createTagStore = () =>
  createStore<TagStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    tags: [],

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAllActiveTags(get().chatbotId)
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
            error: "Failed to fetch tags",
            loading: false,
          })
        }
      }
    },

    getAllActiveTags: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: "9999999",
        active: "true",
      })
      const { data } = await ky
        .get<TagCollection>(
          `/api/chatbots/${chatbotId}/tags?${searchParams.toString()}`,
        )
        .json()

      set({ tags: data })
    },
  }))
