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
  createSavedReplyStore,
  type SavedReplyStore,
} from "./saved-reply-store"

export type SavedReplyStoreApi = ReturnType<typeof createSavedReplyStore>

export const SavedReplyStoreContext = createContext<
  SavedReplyStoreApi | undefined
>(undefined)

export type SavedReplyStoreProviderProps = {
  children: ReactNode
  workspaceId: string
  autoInitialize?: boolean
}

export const SavedReplyStoreProvider = ({
  children,
  workspaceId,
  autoInitialize = true,
}: SavedReplyStoreProviderProps) => {
  const storeRef = useRef<SavedReplyStoreApi>(null)

  if (!storeRef.current) {
    storeRef.current = createSavedReplyStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <SavedReplyStoreContext.Provider value={storeRef.current}>
      {children}
    </SavedReplyStoreContext.Provider>
  )
}

export const useSavedReplyStore = <T,>(
  selector: (store: SavedReplyStore) => T,
): T => {
  const context = useContext(SavedReplyStoreContext)

  if (!context) {
    throw new Error(
      "useSavedReplyStore must be used within SavedReplyStoreProvider",
    )
  }

  return useStore(context, selector)
}
