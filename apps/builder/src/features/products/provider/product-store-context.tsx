"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createProductStore, type ProductStore } from "./product-store"

export type ProductStoreApi = ReturnType<typeof createProductStore>

export const ProductStoreContext = createContext<ProductStoreApi | undefined>(
  undefined,
)

export type ProductStoreProviderProps = {
  children: ReactNode
  workspaceId: string
  autoInitialize?: boolean
}

export const ProductStoreProvider = ({
  children,
  workspaceId,
  autoInitialize = true,
}: ProductStoreProviderProps) => {
  const storeRef = useRef<ProductStoreApi>(null)

  if (!storeRef.current) {
    storeRef.current = createProductStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <ProductStoreContext.Provider value={storeRef.current}>
      {children}
    </ProductStoreContext.Provider>
  )
}

export const useProductStore = <T,>(
  selector: (store: ProductStore) => T,
): T => {
  const context = useContext(ProductStoreContext)

  if (!context) {
    throw new Error("useProductStore must be used within ProductStoreProvider")
  }

  return useStore(context, selector)
}
