"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import type { IntegrationOpenaiCompatibleResource } from "@/features/integration-openai-compatible/schemas/resource"
import {
  createFlowTemplateStore,
  type FlowTemplateStore,
} from "./flow-template-store"

type FlowTemplateStoreApi = ReturnType<typeof createFlowTemplateStore>
const FlowActionContext = createContext<FlowTemplateStoreApi | undefined>(
  undefined,
)

export type FlowTemplateProviderProps = {
  children: ReactNode
  workspaceId: string
  openaiCompatibleIntegrations?: IntegrationOpenaiCompatibleResource[]
  autoInitialize?: boolean
}

export function FlowTemplateStoreProvider({
  children,
  workspaceId,
  openaiCompatibleIntegrations = [],
  autoInitialize = true,
}: FlowTemplateProviderProps) {
  const storeRef = useRef<FlowTemplateStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowTemplateStore({
      workspaceId,
      openaiCompatibleIntegrations,
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

export const useFlowTemplate = <T,>(
  selector: (store: FlowTemplateStore) => T,
): T => {
  const flowActionContext = useContext(FlowActionContext)

  if (!flowActionContext) {
    throw new Error("useFlowAction must be used within FlowTemplateProvider")
  }

  return useStore(flowActionContext, selector)
}
