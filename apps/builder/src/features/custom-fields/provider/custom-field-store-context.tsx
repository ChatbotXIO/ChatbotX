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
  type CustomFieldStore,
  createCustomFieldStore,
} from "./custom-field-store"

export type CustomFieldStoreApi = ReturnType<typeof createCustomFieldStore>

export const CustomFieldStoreContext = createContext<
  CustomFieldStoreApi | undefined
>(undefined)

export type CustomFieldStoreProviderProps = {
  chatbotId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const CustomFieldStoreProvider = ({
  chatbotId,
  autoInitialize = true,
  children,
}: CustomFieldStoreProviderProps) => {
  const storeRef = useRef<CustomFieldStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createCustomFieldStore({
      chatbotId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <CustomFieldStoreContext.Provider value={storeRef.current}>
      {children}
    </CustomFieldStoreContext.Provider>
  )
}

export const useCustomFieldStore = <T,>(
  selector: (store: CustomFieldStore) => T,
): T => {
  const customFieldStoreContext = useContext(CustomFieldStoreContext)

  if (!customFieldStoreContext) {
    throw new Error(
      "useCustomFieldStore must be used within CustomFieldStoreProvider",
    )
  }

  return useStore(customFieldStoreContext, selector)
}
