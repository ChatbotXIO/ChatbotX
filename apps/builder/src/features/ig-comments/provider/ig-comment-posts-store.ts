import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import type { IgCommentVariant } from "../schema/action"

export type InstagramPost = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  media_product_type?: string
  accountId: string
}

export type InstagramAccount = {
  id: string
  name: string
}

export const splitInstagramMediaPosts = (posts: InstagramPost[]) => ({
  published: posts.filter(
    (post) => post.media_product_type?.toUpperCase() !== "REELS",
  ),
  reels: posts.filter(
    (post) => post.media_product_type?.toUpperCase() === "REELS",
  ),
})

export type IgCommentPostsState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  variant: IgCommentVariant
  posts: InstagramPost[]
  pages: InstagramAccount[]
}

export type IgCommentPostsActions = {
  initialize: () => Promise<void>
  fetchPosts: () => Promise<void>
}

export type IgCommentPostsStore = IgCommentPostsState & IgCommentPostsActions

const fetchInstagramMedia = async (
  workspaceId: string,
  variant: IgCommentVariant,
) => await client.igCommentsAPI.instagramMediaAPI({ workspaceId, variant })

export const createIgCommentPostsStore = (
  props: Partial<IgCommentPostsState> & {
    workspaceId: string
    variant: IgCommentVariant
  },
) =>
  createStore<IgCommentPostsStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    posts: [],
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
        const { posts, pages } = await fetchInstagramMedia(workspaceId, variant)
        set({ posts, pages })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch Instagram media",
        })
      } finally {
        set({ loading: false, initialized: true })
      }
    },

    fetchPosts: async () => {
      const { workspaceId, variant } = get()
      set({ loading: true, error: null })
      try {
        const { posts, pages } = await fetchInstagramMedia(workspaceId, variant)
        set({ posts, pages })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch Instagram media",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
