"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import {
  type BroadcastStatsStore,
  createBroadcastStatsStore,
} from "./broadcast-stats-store"

export type BroadcastStatsStoreApi = ReturnType<
  typeof createBroadcastStatsStore
>

export const BroadcastStatsStoreContext = createContext<
  BroadcastStatsStoreApi | undefined
>(undefined)

export type BroadcastStatsStoreProviderProps = {
  workspaceId: string
  broadcastIds: string[]
  children: ReactNode
}

export function BroadcastStatsStoreProvider({
  workspaceId,
  broadcastIds,
  children,
}: BroadcastStatsStoreProviderProps) {
  const storeRef = useRef<BroadcastStatsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createBroadcastStatsStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && broadcastIds.length > 0) {
      storeRef.current.getState().fetchStats(broadcastIds)
    }
  }, [broadcastIds])

  return (
    <BroadcastStatsStoreContext.Provider value={storeRef.current}>
      {children}
    </BroadcastStatsStoreContext.Provider>
  )
}

export function useBroadcastStatsStore<T>(
  selector: (store: BroadcastStatsStore) => T,
): T {
  const storeContext = useContext(BroadcastStatsStoreContext)

  if (!storeContext) {
    throw new Error(
      "useBroadcastStatsStore must be used within BroadcastStatsStoreProvider",
    )
  }

  return useStore(storeContext, selector)
}
