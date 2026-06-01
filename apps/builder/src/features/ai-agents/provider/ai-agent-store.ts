import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListAIAgentsResponse } from "@/features/ai-agents/schemas/query"
import { maxPerPageString } from "@/lib/shared-request"

export type AIAgentState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  aiAgents: ListAIAgentsResponse["data"]
}

export type AIAgentActions = {
  initialize: () => Promise<void>
  getAllAIAgents: () => Promise<void>
}

export type AIAgentStore = AIAgentState & AIAgentActions

export const createAIAgentStore = (props: Partial<AIAgentState>) => {
  let initPromise: Promise<void> | null = null

  return createStore<AIAgentStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    aiAgents: [],
    ...props,

    initialize: async () => {
      if (get().initialized) {
        return
      }

      if (initPromise) {
        await initPromise
        return
      }

      initPromise = get()
        .getAllAIAgents()
        .finally(() => {
          set({ initialized: true })
          initPromise = null
        })

      await initPromise
    },

    getAllAIAgents: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
        })
        const { data } = await ky
          .get<ListAIAgentsResponse>(
            `/api/workspaces/${workspaceId}/ai-agents?${searchParams.toString()}`,
          )
          .json()

        set({ aiAgents: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch AI agents",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
}
