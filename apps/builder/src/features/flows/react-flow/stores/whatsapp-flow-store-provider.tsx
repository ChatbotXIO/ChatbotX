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
  createWhatsappFlowStore,
  type WhatsappFlowStore,
} from "./whatsapp-flow-store"

type WhatsappFlowStoreApi = ReturnType<typeof createWhatsappFlowStore>
const WhatsappFlowContext = createContext<WhatsappFlowStoreApi | undefined>(
  undefined,
)

export type WhatsappFlowProviderProps = {
  children: ReactNode
  workspaceId: string
  autoInitialize?: boolean
}

export function WhatsappFlowStoreProvider({
  children,
  workspaceId,
  autoInitialize = true,
}: WhatsappFlowProviderProps) {
  const storeRef = useRef<WhatsappFlowStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createWhatsappFlowStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <WhatsappFlowContext.Provider value={storeRef.current}>
      {children}
    </WhatsappFlowContext.Provider>
  )
}

export const useWhatsappFlow = <T,>(
  selector: (store: WhatsappFlowStore) => T,
): T => {
  const ctx = useContext(WhatsappFlowContext)

  if (!ctx) {
    throw new Error(
      "useWhatsappFlow must be used within WhatsappFlowStoreProvider",
    )
  }

  return useStore(ctx, selector)
}
