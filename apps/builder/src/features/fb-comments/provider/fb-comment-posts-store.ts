import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type FacebookPost = {
  id: string
  message?: string
  full_picture?: string
  created_time: string
  permalink_url?: string
}

export type FbCommentPostsState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  publishedPosts: FacebookPost[]
  adsPosts: FacebookPost[]
  reelsPosts: FacebookPost[]
}

export type FbCommentPostsActions = {
  initialize: () => Promise<void>
  fetchPublishedPosts: () => Promise<void>
  fetchAdsPosts: () => Promise<void>
  fetchReelsPosts: () => Promise<void>
}

export type FbCommentPostsStore = FbCommentPostsState & FbCommentPostsActions

const fetchPosts = async (
  workspaceId: string,
  type: "published" | "ads" | "reels",
): Promise<FacebookPost[]> => {
  const { posts } = await client.fbCommentsAPI.facebookPostsAPI({
    workspaceId,
    type,
  })
  return posts
}

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
    ...props,

    initialize: async () => {
      const { initialized } = get()
      if (initialized) {
        return
      }

      set({ loading: true, error: null })
      try {
        const { workspaceId } = get()
        const [publishedPosts, adsPosts, reelsPosts] = await Promise.all([
          fetchPosts(workspaceId, "published"),
          fetchPosts(workspaceId, "ads"),
          fetchPosts(workspaceId, "reels"),
        ])
        set({ publishedPosts, adsPosts, reelsPosts })
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

    fetchPublishedPosts: async () => {
      const { workspaceId } = get()
      set({ loading: true, error: null })
      try {
        const publishedPosts = await fetchPosts(workspaceId, "published")
        set({ publishedPosts })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch published posts",
        })
      } finally {
        set({ loading: false })
      }
    },

    fetchAdsPosts: async () => {
      const { workspaceId } = get()
      set({ loading: true, error: null })
      try {
        const adsPosts = await fetchPosts(workspaceId, "ads")
        set({ adsPosts })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch ads posts",
        })
      } finally {
        set({ loading: false })
      }
    },

    fetchReelsPosts: async () => {
      const { workspaceId } = get()
      set({ loading: true, error: null })
      try {
        const reelsPosts = await fetchPosts(workspaceId, "reels")
        set({ reelsPosts })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch reels posts",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
