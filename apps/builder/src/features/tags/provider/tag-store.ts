import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListTagsResponse } from "../schemas/query"
import type { TagResource } from "../schemas/resource"

export type TagState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  tags: TagResource[]
}

export type TagActions = {
  initialize: () => Promise<void>
  getAllActiveTags: () => Promise<void>
}

export type TagStore = TagState & TagActions

export const createTagStore = (props: Partial<TagState>) =>
  createStore<TagStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    tags: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllActiveTags()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError ? error.message : "Failed to fetch tags",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllActiveTags: async () => {
      const { chatbotId, loading } = get()

      if (loading || !chatbotId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
          active: "true",
        })
        const { data } = await ky
          .get<ListTagsResponse>(
            `/api/chatbots/${chatbotId}/tags?${searchParams.toString()}`,
          )
          .json()

        set({ tags: data, loading: false })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError ? error.message : "Failed to fetch tags",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
