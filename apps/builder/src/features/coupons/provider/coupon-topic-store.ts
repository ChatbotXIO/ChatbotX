import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type CouponTopicOption = {
  id: string
  name: string
  expiresAt: Date | string | null
}

export type CouponTopicState = {
  workspaceId: string
  topics: CouponTopicOption[]
  isInitialized: boolean
  isLoading: boolean
  error: string | null
}

export type CouponTopicActions = {
  initialize: (
    workspaceId?: string,
    options?: { force?: boolean },
  ) => Promise<void>
  refresh: (workspaceId?: string) => Promise<void>
}

export type CouponTopicStore = CouponTopicState & CouponTopicActions

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Failed to fetch coupon topics"

export const createCouponTopicStore = (props: Partial<CouponTopicState>) =>
  createStore<CouponTopicStore>((set, get) => ({
    workspaceId: "",
    topics: [],
    isInitialized: false,
    isLoading: false,
    error: null,
    ...props,

    initialize: async (workspaceId, options) => {
      const state = get()
      const nextWorkspaceId = workspaceId ?? state.workspaceId

      if (!nextWorkspaceId || state.isLoading) {
        return
      }

      if (
        state.isInitialized &&
        state.workspaceId === nextWorkspaceId &&
        !options?.force
      ) {
        return
      }

      set({ workspaceId: nextWorkspaceId, isLoading: true, error: null })

      try {
        const topics = await client.couponsAPI.listCouponTopicOptionsAPI({
          workspaceId: nextWorkspaceId,
          issueableOnly: false,
        })

        set({
          topics,
          workspaceId: nextWorkspaceId,
          isInitialized: true,
          isLoading: false,
        })
      } catch (error) {
        set({ error: getErrorMessage(error), isLoading: false })
      } finally {
        set({ isLoading: false })
      }
    },

    refresh: async (workspaceId) => {
      await get().initialize(workspaceId, { force: true })
    },
  }))
