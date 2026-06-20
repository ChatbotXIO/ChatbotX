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
  createUserPersistentMenuStore,
  type UserPersistentMenuStore,
} from "./user-persistent-menu-store"

export type UserPersistentMenuStoreApi = ReturnType<
  typeof createUserPersistentMenuStore
>

export const UserPersistentMenuStoreContext = createContext<
  UserPersistentMenuStoreApi | undefined
>(undefined)

export type UserPersistentMenuStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const UserPersistentMenuStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: UserPersistentMenuStoreProviderProps) => {
  const storeRef = useRef<UserPersistentMenuStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createUserPersistentMenuStore({ workspaceId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <UserPersistentMenuStoreContext.Provider value={storeRef.current}>
      {children}
    </UserPersistentMenuStoreContext.Provider>
  )
}

export const useUserPersistentMenuStore = <T,>(
  selector: (store: UserPersistentMenuStore) => T,
): T => {
  const context = useContext(UserPersistentMenuStoreContext)

  if (!context) {
    throw new Error(
      "useUserPersistentMenuStore must be used within UserPersistentMenuStoreProvider",
    )
  }

  return useStore(context, selector)
}
