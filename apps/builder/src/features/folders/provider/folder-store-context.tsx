"use client"

import type { FolderType } from "@chatbotx.io/database/partials"
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createFolderStore, type FolderStore } from "./folder-store"

export type FolderStoreApi = ReturnType<typeof createFolderStore>

export const FolderStoreContext = createContext<FolderStoreApi | undefined>(
  undefined,
)

export type FolderStoreProviderProps = {
  workspaceId: string
  folderType: FolderType
  children: ReactNode
  autoInitialize?: boolean
}

export const FolderStoreProvider = ({
  autoInitialize = true,
  children,
  ...rest
}: FolderStoreProviderProps) => {
  const storeRef = useRef<FolderStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createFolderStore(rest)
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <FolderStoreContext.Provider value={storeRef.current}>
      {children}
    </FolderStoreContext.Provider>
  )
}

export const useFolderStore = <T,>(selector: (store: FolderStore) => T): T => {
  const folderStoreContext = useContext(FolderStoreContext)

  if (!folderStoreContext) {
    throw new Error("useFolderStore must be used within FolderStoreProvider")
  }

  return useStore(folderStoreContext, selector)
}
