import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"
import type { ListFlowsResponse } from "../schema/query"

type FlowStateFilter = { startType?: string; integrationWhatsappId?: string }

export type FlowState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  filter: FlowStateFilter
  flows: ListFlowsResponse["data"]
}

export type FlowActions = {
  initialize: () => Promise<void>
  getAllActiveFlows: () => Promise<void>
  appendFilter: (filter: FlowStateFilter) => void
  resetFilter: () => void
}

export type FlowStore = FlowState & FlowActions

export const createFlowStore = (props: Partial<FlowState>) =>
  createStore<FlowStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    filter: {},
    flows: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllActiveFlows()
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to fetch flows",
        })
      } finally {
        set({ initialized: true })
      }
    },

    appendFilter: (filter: FlowStateFilter) => {
      const { filter: currentFilter } = get()
      set({ filter: { ...currentFilter, ...filter } })
    },

    resetFilter: () => {
      set({ filter: {} })
    },

    getAllActiveFlows: async () => {
      const { workspaceId, loading, filter } = get()

      if (loading || !workspaceId) {
        return
      }

      try {
        set({ loading: true, error: null })

        const { data } = await client.flowsAPI.privateListFlowsAPI({
          workspaceId,
          perPage: maxPerPage,
          active: true,
          ...filter,
        })

        set({ flows: data as ListFlowsResponse["data"] })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error ? error.message : "Failed to fetch flows",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
