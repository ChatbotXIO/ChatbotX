"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import type { FlowTemplateMenuData } from "../nodes/types"
import {
  createFlowTemplateStore,
  type FlowTemplateStore,
} from "./flow-template-store"

export type { WhatsappMessageTemplateResource } from "@/features/integration-whatsapp/message-templates/schema/resource"

export type FlowTemplateStoreApi = ReturnType<typeof createFlowTemplateStore>

const FlowActionContext = createContext<FlowTemplateStoreApi | undefined>(
  undefined,
)

export type FlowTemplateProviderProps = {
  children: ReactNode
  chatbotId: string
  templates?: FlowTemplateMenuData
  beforeStep?: { channel?: string; [key: string]: unknown }
  autoInitialize?: boolean
}

export function FlowTemplateStoreProvider({
  children,
  chatbotId,
  templates,
  beforeStep,
  autoInitialize = true,
}: FlowTemplateProviderProps) {
  const storeRef = useRef<FlowTemplateStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFlowTemplateStore({
      chatbotId,
      templates,
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

export const useFlowTemplate = <T,>(
  selector: (store: FlowTemplateStore) => T,
): T => {
  const flowActionContext = useContext(FlowActionContext)

  if (!flowActionContext) {
    throw new Error("useFlowAction must be used within FlowTemplateProvider")
  }

  return useStore(flowActionContext, selector)
}
