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
  createIntegrationStore,
  type IntegrationStore,
} from "./integration-store"

export type IntegrationStoreApi = ReturnType<typeof createIntegrationStore>

export const IntegrationStoreContext = createContext<
  IntegrationStoreApi | undefined
>(undefined)

export type IntegrationStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const IntegrationStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: IntegrationStoreProviderProps) => {
  const storeRef = useRef<IntegrationStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createIntegrationStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <IntegrationStoreContext.Provider value={storeRef.current}>
      {children}
    </IntegrationStoreContext.Provider>
  )
}

export const useIntegrationStore = <T,>(
  selector: (store: IntegrationStore) => T,
): T => {
  const integrationStoreContext = useContext(IntegrationStoreContext)

  if (!integrationStoreContext) {
    throw new Error(
      "useIntegrationStore must be used within IntegrationStoreProvider",
    )
  }

  return useStore(integrationStoreContext, selector)
}
