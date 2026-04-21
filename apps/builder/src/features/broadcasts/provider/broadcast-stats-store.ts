import type { GetBatchBroadcastStatsResponse } from "@chatbotx.io/analytics/schemas"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type BroadcastStatsState = {
  stats: GetBatchBroadcastStatsResponse
  isLoading: boolean
  error: string | null
  fetchedBroadcastIds: Set<string>
}

export type BroadcastStatsActions = {
  fetchStats: (broadcastIds: string[]) => Promise<void>
  reset: () => void
}

export type BroadcastStatsStore = BroadcastStatsState & BroadcastStatsActions

export type BroadcastStatsStoreProps = {
  workspaceId: string
}

const initialState: BroadcastStatsState = {
  stats: {},
  isLoading: false,
  error: null,
  fetchedBroadcastIds: new Set(),
}

export function createBroadcastStatsStore(props: BroadcastStatsStoreProps) {
  return createStore<BroadcastStatsStore>()((set, get) => ({
    ...initialState,

    fetchStats: async (broadcastIds: string[]) => {
      const { fetchedBroadcastIds, stats } = get()

      const newBroadcastIds = broadcastIds.filter(
        (id) => !fetchedBroadcastIds.has(id),
      )

      if (newBroadcastIds.length === 0) {
        return
      }

      set({ isLoading: true, error: null })

      try {
        const result = await ky
          .post<GetBatchBroadcastStatsResponse>(
            `/api/workspaces/${props.workspaceId}/broadcasts/stats`,
            {
              json: {
                workspaceId: props.workspaceId,
                broadcastIds: newBroadcastIds,
              },
            },
          )
          .json<GetBatchBroadcastStatsResponse>()

        const newFetchedIds = new Set(fetchedBroadcastIds)
        for (const id of newBroadcastIds) {
          newFetchedIds.add(id)
        }

        set({
          stats: { ...stats, ...result },
          isLoading: false,
          fetchedBroadcastIds: newFetchedIds,
        })
      } catch (error) {
        set({
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Failed to fetch stats",
        })
      }
    },

    reset: () => {
      set(initialState)
    },
  }))
}
