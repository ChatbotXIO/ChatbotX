import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"
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
        const { data } = await client.tagsAPI.privateListWorkspaceTagsAPI({
          workspaceId,
          perPage: maxPerPage,
        })

        set({ tags: data, loading: false })
      } catch {
        set({ error: "Failed to fetch tags" })
      } finally {
        set({ loading: false })
      }
    },
  }))
