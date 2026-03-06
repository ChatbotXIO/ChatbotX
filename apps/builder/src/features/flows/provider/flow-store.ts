import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListFlowsResponse } from "../schemas/query"

export type FlowState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  flows: ListFlowsResponse["data"]
}

export type FlowActions = {
  initialize: () => Promise<void>
  getAllActiveFlows: () => Promise<void>
}

export type FlowStore = FlowState & FlowActions

export const createFlowStore = (props: Partial<FlowState>) =>
  createStore<FlowStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
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

    getAllActiveFlows: async () => {
      const { chatbotId, loading } = get()

      if (loading || !chatbotId) {
        return
      }

      try {
        set({ loading: true, error: null })

        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
          active: "true",
        })
        const { data } = await ky
          .get<ListFlowsResponse>(
            `/api/chatbots/${chatbotId}/flows?${searchParams.toString()}`,
          )
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
