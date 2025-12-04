"use client"

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
} from "react"
import { useStore } from "zustand"
import { createUserStore, type UserStore } from "./user-store"

export type UserStoreApi = ReturnType<typeof createUserStore>

export const UserStoreContext = createContext<UserStoreApi | undefined>(
  undefined,
)

export type UserStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitializeAgentsAndInboxTeams?: boolean
}

export const UserStoreProvider = ({
  chatbotId,
  autoInitializeAgentsAndInboxTeams = false,
  children,
}: UserStoreProviderProps) => {
  const storeRef = useRef<UserStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createUserStore({ chatbotId })
  }

  useEffect(() => {
    if (storeRef.current && autoInitializeAgentsAndInboxTeams) {
      storeRef.current.getState().initializeAgentsAndInboxTeams()
    }
  }, [autoInitializeAgentsAndInboxTeams])

  return (
    <UserStoreContext.Provider value={storeRef.current}>
      {children}
    </UserStoreContext.Provider>
  )
}

export const useUserStore = <T,>(selector: (store: UserStore) => T): T => {
  const userStoreContext = useContext(UserStoreContext)

  if (!userStoreContext) {
    throw new Error("useUserStore must be used within UserStoreProvider")
  }

  return useStore(userStoreContext, selector)
}
