"use client"

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { useWorkspaceId } from "@/hooks/routing"
import type { ListFlowsResponse } from "../schema/query"
import { type FlowStateFilter, useFlows, useInvalidateFlows } from "./flow-hook"

export type FlowStoreProviderProps = {
  children: ReactNode
}

type FlowFilterContextValue = {
  filter: FlowStateFilter
  setFilter: Dispatch<SetStateAction<FlowStateFilter>>
}

const FlowFilterContext = createContext<FlowFilterContextValue | null>(null)

const hasSameFilterValues = (left: FlowStateFilter, right: FlowStateFilter) => {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)

  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        left[key as keyof FlowStateFilter] ===
          right[key as keyof FlowStateFilter],
    )
  )
}

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

  const filter = filterContext?.filter
  const setFilter = filterContext?.setFilter

  const appendFilter = useCallback(
    (nextFilter: FlowStateFilter) => {
      setFilter?.((previousFilter) => {
        const nextFilterState = { ...previousFilter, ...nextFilter }
        return hasSameFilterValues(previousFilter, nextFilterState)
          ? previousFilter
          : nextFilterState
      })
    },
    [setFilter],
  )

  const resetFilter = useCallback(() => {
    setFilter?.((previousFilter) =>
      Object.keys(previousFilter).length === 0 ? previousFilter : {},
    )
  }, [setFilter])

  const snapshot = useMemo<FlowStoreSnapshot>(
    () => ({
      loading: flowQuery.isPending,
      error: flowQuery.error?.message ?? null,
      initialized: flowQuery.isFetched,
      workspaceId: workspaceId ?? "",
      filter: filter ?? {},
      flows: flowQuery.data ?? [],
      initialize: invalidateFlows,
      getAllActiveFlows: invalidateFlows,
      appendFilter,
      resetFilter,
    }),
    [
      appendFilter,
      filter,
      flowQuery.data,
      flowQuery.error,
      flowQuery.isFetched,
      flowQuery.isPending,
      invalidateFlows,
      resetFilter,
      workspaceId,
    ],
  )

  return selector(snapshot)
}
