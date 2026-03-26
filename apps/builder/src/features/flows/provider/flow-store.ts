import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListFlowsResponse } from "../schemas/query"

type FlowStateFilter = { startType?: string; integrationWhatsappId?: string }

export type FlowState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  filter?: FlowStateFilter
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

    chatbotId: "",
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
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch flows",
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
      const { chatbotId, loading, filter } = get()

      if (loading || !chatbotId) {
        return
      }

      try {
        set({ loading: true, error: null })

        const { data } = await ky
          .get<ListFlowsResponse>(`/api/chatbots/${chatbotId}/flows`, {
            searchParams: {
              perPage: maxPerPageString,
              active: "true",
              ...filter,
            },
          })
          .json()

        set({ flows: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch flows",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
