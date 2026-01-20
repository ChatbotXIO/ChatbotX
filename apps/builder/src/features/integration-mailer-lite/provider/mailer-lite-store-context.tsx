"use client"

import { createContext, type ReactNode, useContext, useRef } from "react"
import { useStore } from "zustand"
import {
  createMailerLiteStore,
  type MailerLiteStore,
} from "./mailer-lite-store"

export type MailerLiteStoreApi = ReturnType<typeof createMailerLiteStore>

export const MailerLiteStoreContext = createContext<
  MailerLiteStoreApi | undefined
>(undefined)

export type MailerLiteStoreProviderProps = {
  children: ReactNode
}

export const MailerLiteStoreProvider = ({
  children,
}: MailerLiteStoreProviderProps) => {
  const storeRef = useRef<MailerLiteStoreApi>(undefined)

  if (!storeRef.current) {
    storeRef.current = createMailerLiteStore()
  }

  return (
    <MailerLiteStoreContext.Provider value={storeRef.current}>
      {children}
    </MailerLiteStoreContext.Provider>
  )
}

export const useMailerLiteStore = <T,>(
  selector: (store: MailerLiteStore) => T,
): T => {
  const context = useContext(MailerLiteStoreContext)

  if (!context) {
    throw new Error(
      "useMailerLiteStore must be used within MailerLiteStoreProvider",
    )
  }

  return useStore(context, selector)
}
