"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createKlaviyoStore, type KlaviyoStore } from "./klaviyo-store"

export type KlaviyoStoreApi = ReturnType<typeof createKlaviyoStore>

export const KlaviyoStoreContext = createContext<KlaviyoStoreApi | undefined>(
  undefined,
)

export type KlaviyoStoreProviderProps = {
  children: ReactNode
}

export const KlaviyoStoreProvider = ({
  children,
}: KlaviyoStoreProviderProps) => {
  const storeRef = useRef<KlaviyoStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createKlaviyoStore()
  }

  return (
    <KlaviyoStoreContext.Provider value={storeRef.current}>
      {children}
    </KlaviyoStoreContext.Provider>
  )
}

export const useKlaviyoStore = <T,>(
  selector: (store: KlaviyoStore) => T,
): T => {
  const context = useContext(KlaviyoStoreContext)

  if (!context) {
    throw new Error("useKlaviyoStore must be used within KlaviyoStoreProvider")
  }

  return useStore(context, selector)
}
