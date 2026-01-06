"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import { createMailchimpStore, type MailchimpStore } from "./mailchimp-store"

export type MailchimpStoreApi = ReturnType<typeof createMailchimpStore>

export const MailchimpStoreContext = createContext<
  MailchimpStoreApi | undefined
>(undefined)

export type MailchimpStoreProviderProps = {
  children: ReactNode
}

export const MailchimpStoreProvider = ({
  children,
}: MailchimpStoreProviderProps) => {
  const storeRef = useRef<MailchimpStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createMailchimpStore()
  }

  return (
    <MailchimpStoreContext.Provider value={storeRef.current}>
      {children}
    </MailchimpStoreContext.Provider>
  )
}

export const useMailchimpStore = <T,>(
  selector: (store: MailchimpStore) => T,
): T => {
  const context = useContext(MailchimpStoreContext)

  if (!context) {
    throw new Error(
      "useMailchimpStore must be used within MailchimpStoreProvider",
    )
  }

  return useStore(context, selector)
}
