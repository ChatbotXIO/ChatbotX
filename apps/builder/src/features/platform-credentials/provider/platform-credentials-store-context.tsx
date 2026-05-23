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
  createPlatformCredentialsStore,
  type PlatformCredentialsStore,
} from "./platform-credentials-store"

export type PlatformCredentialsStoreApi = ReturnType<
  typeof createPlatformCredentialsStore
>

export const PlatformCredentialsStoreContext = createContext<
  PlatformCredentialsStoreApi | undefined
>(undefined)

export const PlatformCredentialsStoreProvider = ({
  children,
}: {
  children: ReactNode
}) => {
  const storeRef = useRef<PlatformCredentialsStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createPlatformCredentialsStore()
  }

  useEffect(() => {
    storeRef.current?.getState().initialize()
  }, [])

  return (
    <PlatformCredentialsStoreContext.Provider value={storeRef.current}>
      {children}
    </PlatformCredentialsStoreContext.Provider>
  )
}

export const usePlatformCredentialsStore = <T,>(
  selector: (store: PlatformCredentialsStore) => T,
): T => {
  const context = useContext(PlatformCredentialsStoreContext)

  if (!context) {
    throw new Error(
      "usePlatformCredentialsStore must be used within PlatformCredentialsStoreProvider",
    )
  }

  return useStore(context, selector)
}
