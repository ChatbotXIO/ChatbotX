"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react"
import { useWorkspaceId } from "@/hooks/routing"
import type { ListFlowsResponse } from "../schema/query"
import { type FlowStateFilter, useFlows, useInvalidateFlows } from "./flow-hook"

export type FlowStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

type FlowFilterContextValue = {
  filter: FlowStateFilter
  setFilter: (filter: FlowStateFilter) => void
}

const FlowFilterContext = createContext<FlowFilterContextValue | null>(null)

export const FlowStoreProvider = ({ children }: FlowStoreProviderProps) => {
  const [filter, setFilter] = useState<FlowStateFilter>({})

  const value = useMemo(() => ({ filter, setFilter }), [filter])

  return (
    <FlowFilterContext.Provider value={value}>
      {children}
    </FlowFilterContext.Provider>
  )
}

type FlowStoreSnapshot = {
  loading: boolean
  error: string | null
  initialized: boolean
  workspaceId: string
  filter: FlowStateFilter
  flows: ListFlowsResponse["data"]
  initialize: () => Promise<unknown>
  getAllActiveFlows: () => Promise<unknown>
  appendFilter: (filter: FlowStateFilter) => void
  resetFilter: () => void
}

export const useFlowStore = <T,>(
  selector: (store: FlowStoreSnapshot) => T,
): T => {
  const workspaceId = useWorkspaceId()
  const filterContext = useContext(FlowFilterContext)
  const flowQuery = useFlows(workspaceId, { filter: filterContext?.filter })
  const invalidateFlows = useInvalidateFlows()

  const snapshot = useMemo<FlowStoreSnapshot>(
    () => ({
      loading: flowQuery.isPending,
      error: flowQuery.error?.message ?? null,
      initialized: flowQuery.isFetched,
      workspaceId: workspaceId ?? "",
      filter: filterContext?.filter ?? {},
      flows: flowQuery.data ?? [],
      initialize: invalidateFlows,
      getAllActiveFlows: invalidateFlows,
      appendFilter: (nextFilter) => {
        filterContext?.setFilter({
          ...(filterContext.filter ?? {}),
          ...nextFilter,
        })
      },
      resetFilter: () => filterContext?.setFilter({}),
    }),
    [filterContext, flowQuery, invalidateFlows, workspaceId],
  )

  return selector(snapshot)
}
