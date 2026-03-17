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
  createFlowActionStore,
  type FlowActionStore,
} from "./flow-action-store"

export type FlowActionStoreApi = ReturnType<typeof createFlowActionStore>

const FlowActionContext = createContext<FlowActionStoreApi | undefined>(
  undefined,
)

export type FlowActionProviderProps = {
  children: ReactNode
  chatbotId: string
  data?: Record<string, unknown>
  beforeStep?: { channel?: string; [key: string]: unknown }
  autoInitialize?: boolean
}

export function FlowActionProvider({
  children,
  chatbotId,
  data,
  beforeStep,
  autoInitialize = true,
}: FlowActionProviderProps) {
  const storeRef = useRef<FlowActionStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowActionStore({
      chatbotId,
      data,
      beforeStep,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <FlowActionContext.Provider value={storeRef.current}>
      {children}
    </FlowActionContext.Provider>
  )
}

export const useFlowAction = <T,>(
  selector: (store: FlowActionStore) => T,
): T => {
  const flowActionContext = useContext(FlowActionContext)

  if (!flowActionContext) {
    throw new Error("useFlowAction must be used within FlowActionProvider")
  }

  return useStore(flowActionContext, selector)
}
