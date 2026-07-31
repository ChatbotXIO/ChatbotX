import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type FacebookPost = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
  media_product_type?: string
  pageId: string
}

export type FacebookPage = {
  id: string
  name: string
}

export type FbCommentPostsState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  publishedPosts: FacebookPost[]
  adsPosts: FacebookPost[]
  reelsPosts: FacebookPost[]
  pages: FacebookPage[]
}

export type FbCommentPostsActions = {
  initialize: () => Promise<void>
}

export type FbCommentPostsStore = FbCommentPostsState & FbCommentPostsActions

export const createFbCommentPostsStore = (
  props: Partial<FbCommentPostsState>,
) =>
  createStore<FbCommentPostsStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    publishedPosts: [],
    adsPosts: [],
    reelsPosts: [],
    pages: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()
      if (initialized) {
        return
      }

      set({ loading: true, error: null })
      try {
        const { workspaceId } = get()
        const { published, ads, reels, pages } =
          await client.fbCommentsAPI.facebookPostsAPI({ workspaceId })
        set({
          publishedPosts: published,
          adsPosts: ads,
          reelsPosts: reels,
          pages,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch Facebook posts",
        })
      } finally {
        set({ loading: false, initialized: true })
      }
    },
  }))
