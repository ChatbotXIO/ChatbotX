import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { maxPerPageString } from "@/lib/shared-request"
import type { FlowResource } from "../schemas/resource"

export type FlowState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  flows: FlowResource[]
}

export type FlowActions = {
  initialize: (chatbotId: string) => Promise<void>
  getAllActiveFlows: (chatbotId: string) => Promise<void>
}

export type FlowStore = FlowState & FlowActions

export const createFlowStore = () =>
  createStore<FlowStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    flows: [],

    initialize: async (chatbotId: string) => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })
      try {
        await get().getAllActiveFlows(chatbotId)
        set({
          loading: false,
          initialized: true,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch flows",
            loading: false,
          })
        }
      }
    },

    getAllActiveFlows: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
        active: "true",
      })
      const { data } = await ky
        .get<PaginatedResponse<FlowResource>>(
          `/api/chatbots/${chatbotId}/flows?${searchParams.toString()}`,
        )
        .json()

      set({ flows: data })
    },
  }))
