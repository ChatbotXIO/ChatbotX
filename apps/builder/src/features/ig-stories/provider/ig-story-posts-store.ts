import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import type { IgStoryVariant } from "../schema/action"

export type InstagramStory = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  accountId: string
}

export type InstagramAccount = {
  id: string
  name: string
}

export type IgStoryPostsState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  variant: IgStoryVariant
  stories: InstagramStory[]
  pages: InstagramAccount[]
}

export type IgStoryPostsActions = {
  initialize: () => Promise<void>
  fetchStories: () => Promise<void>
}

export type IgStoryPostsStore = IgStoryPostsState & IgStoryPostsActions

const fetchInstagramStories = async (
  workspaceId: string,
  variant: IgStoryVariant,
) => await client.igStoriesAPI.instagramStoriesAPI({ workspaceId, variant })

export const createIgStoryPostsStore = (
  props: Partial<IgStoryPostsState> & {
    workspaceId: string
    variant: IgStoryVariant
  },
) =>
  createStore<IgStoryPostsStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    stories: [],
    pages: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()
      if (initialized) {
        return
      }

      set({ loading: true, error: null })
      try {
        const { workspaceId, variant } = get()
        const { stories, pages } = await fetchInstagramStories(
          workspaceId,
          variant,
        )
        set({ stories, pages })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch Instagram stories",
        })
      } finally {
        set({ loading: false, initialized: true })
      }
    },

    fetchStories: async () => {
      const { workspaceId, variant } = get()
      set({ loading: true, error: null })
      try {
        const { stories, pages } = await fetchInstagramStories(
          workspaceId,
          variant,
        )
        set({ stories, pages })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch Instagram stories",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
