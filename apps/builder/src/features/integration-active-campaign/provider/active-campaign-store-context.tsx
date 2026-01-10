"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import {
  type ActiveCampaignStore,
  createActiveCampaignStore,
} from "./active-campaign-store"

export type ActiveCampaignStoreApi = ReturnType<
  typeof createActiveCampaignStore
>

export const ActiveCampaignStoreContext = createContext<
  ActiveCampaignStoreApi | undefined
>(undefined)

export type ActiveCampaignStoreProviderProps = {
  children: ReactNode
}

export const ActiveCampaignStoreProvider = ({
  children,
}: ActiveCampaignStoreProviderProps) => {
  const storeRef = useRef<ActiveCampaignStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createActiveCampaignStore()
  }

  return (
    <ActiveCampaignStoreContext.Provider value={storeRef.current}>
      {children}
    </ActiveCampaignStoreContext.Provider>
  )
}

export const useActiveCampaignStore = <T,>(
  selector: (store: ActiveCampaignStore) => T,
): T => {
  const context = useContext(ActiveCampaignStoreContext)

  if (!context) {
    throw new Error(
      "useActiveCampaignStore must be used within ActiveCampaignStoreProvider",
    )
  }

  return useStore(context, selector)
}
