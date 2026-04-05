import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListTagsResponse } from "../schema/query"
import type { TagResource } from "../schema/resource"

export type TagState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
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

    workspaceId: "",
    tags: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getAllActiveTags()
      set({ initialized: true })
    },

    getAllActiveTags: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const { data } = await ky
          .get<ListTagsResponse>(`/api/workspaces/${workspaceId}/tags`, {
            searchParams: {
              perPage: maxPerPageString,
            },
          })
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
