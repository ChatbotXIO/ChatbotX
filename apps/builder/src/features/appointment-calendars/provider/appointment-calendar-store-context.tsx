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
  type AppointmentCalendarStore,
  createAppointmentCalendarStore,
} from "./appointment-calendar-store"

export type AppointmentCalendarStoreApi = ReturnType<
  typeof createAppointmentCalendarStore
>

export const AppointmentCalendarStoreContext = createContext<
  AppointmentCalendarStoreApi | undefined
>(undefined)

export type AppointmentCalendarStoreProviderProps = {
  workspaceId: string
  children: ReactNode
  autoInitialize?: boolean
}

export const AppointmentCalendarStoreProvider = ({
  workspaceId,
  autoInitialize = true,
  children,
}: AppointmentCalendarStoreProviderProps) => {
  const storeRef = useRef<AppointmentCalendarStoreApi>(null)
  if (!storeRef.current) {
    storeRef.current = createAppointmentCalendarStore({
      workspaceId,
    })
  }

  useEffect(() => {
    if (storeRef.current && autoInitialize) {
      storeRef.current.getState().initialize()
    }
  }, [autoInitialize])

  return (
    <AppointmentCalendarStoreContext.Provider value={storeRef.current}>
      {children}
    </AppointmentCalendarStoreContext.Provider>
  )
}

export const useAppointmentCalendarStore = <T,>(
  selector: (store: AppointmentCalendarStore) => T,
): T => {
  const appointmentCalendarStoreContext = useContext(
    AppointmentCalendarStoreContext,
  )

  if (!appointmentCalendarStoreContext) {
    throw new Error(
      "useAppointmentCalendarStore must be used within AppointmentCalendarStoreProvider",
    )
  }

  return useStore(appointmentCalendarStoreContext, selector)
}
