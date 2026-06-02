"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
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
  const store = useMemo(
    () => createWhatsappFlowStore({ workspaceId }),
    [workspaceId],
  )

  useEffect(() => {
    if (autoInitialize) {
      store.getState().initialize()
    }
  }, [store, autoInitialize])

  return (
    <WhatsappFlowContext.Provider value={store}>
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
