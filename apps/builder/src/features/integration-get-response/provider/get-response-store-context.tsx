"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import {
  createGetResponseStore,
  type GetResponseStore,
} from "./get-response-store"

export type GetResponseStoreApi = ReturnType<typeof createGetResponseStore>

export const GetResponseStoreContext = createContext<
  GetResponseStoreApi | undefined
>(undefined)

export type GetResponseStoreProviderProps = {
  children: ReactNode
}

export const GetResponseStoreProvider = ({
  children,
}: GetResponseStoreProviderProps) => {
  const storeRef = useRef<GetResponseStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createGetResponseStore()
  }

  return (
    <GetResponseStoreContext.Provider value={storeRef.current}>
      {children}
    </GetResponseStoreContext.Provider>
  )
}

export const useGetResponseStore = <T,>(
  selector: (store: GetResponseStore) => T,
): T => {
  const context = useContext(GetResponseStoreContext)

  if (!context) {
    throw new Error(
      "useGetResponseStore must be used within GetResponseStoreProvider",
    )
  }

  return useStore(context, selector)
}
