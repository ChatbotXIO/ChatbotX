"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createTemplateStore, type TemplateStore } from "./template-store"

export type TemplateStoreApi = ReturnType<typeof createTemplateStore>

export const TemplateStoreContext = createContext<TemplateStoreApi | undefined>(
  undefined,
)

export type TemplateStoreProviderProps = {
  workspaceId: string
  integrationWhatsappId?: string
  children: ReactNode
  autoInitialize?: boolean
}

export const TemplateStoreProvider = ({
  workspaceId,
  integrationWhatsappId,
  autoInitialize = true,
  children,
}: TemplateStoreProviderProps) => {
  const storeRef = useRef<TemplateStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createTemplateStore({
      workspaceId,
      integrationWhatsappId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <TemplateStoreContext.Provider value={storeRef.current}>
      {children}
    </TemplateStoreContext.Provider>
  )
}

export const useTemplateStore = <T,>(
  selector: (store: TemplateStore) => T,
): T => {
  const templateStoreContext = useContext(TemplateStoreContext)

  if (!templateStoreContext) {
    throw new Error(
      "useTemplateStore must be used within TemplateStoreProvider",
    )
  }

  return useStore(templateStoreContext, selector)
}
