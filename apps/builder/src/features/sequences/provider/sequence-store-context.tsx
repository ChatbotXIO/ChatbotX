"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createSequenceStore, type SequenceStore } from "./sequence-store"

export type SequenceStoreApi = ReturnType<typeof createSequenceStore>

export const SequenceStoreContext = createContext<SequenceStoreApi | undefined>(
  undefined,
)

export type SequenceStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const SequenceStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: SequenceStoreProviderProps) => {
  const storeRef = useRef<SequenceStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createSequenceStore({ chatbotId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <SequenceStoreContext.Provider value={storeRef.current}>
      {children}
    </SequenceStoreContext.Provider>
  )
}

export const useSequenceStore = <T,>(
  selector: (store: SequenceStore) => T,
): T => {
  const sequenceStoreContext = useContext(SequenceStoreContext)

  if (!sequenceStoreContext) {
    throw new Error(
      "useSequenceStore must be used within SequenceStoreProvider",
    )
  }

  return useStore(sequenceStoreContext, selector)
}
