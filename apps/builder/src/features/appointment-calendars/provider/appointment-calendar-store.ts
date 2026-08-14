import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListAppointmentCalendarsForFlowResponse } from "../schemas/query"

export type AppointmentCalendarState = {
  loading: boolean
  error: string | null
  initialized: boolean
  workspaceId: string
  appointmentCalendars: ListAppointmentCalendarsForFlowResponse
}

export type AppointmentCalendarActions = {
  initialize: () => Promise<void>
  getAllAppointmentCalendarsForFlow: () => Promise<void>
}

export type AppointmentCalendarStore = AppointmentCalendarState &
  AppointmentCalendarActions

export const createAppointmentCalendarStore = (
  props: Partial<AppointmentCalendarState>,
) =>
  createStore<AppointmentCalendarStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,
    workspaceId: "",
    appointmentCalendars: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getAllAppointmentCalendarsForFlow()
      set({ initialized: true })
    },

    getAllAppointmentCalendarsForFlow: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const appointmentCalendars = await ky
          .get<ListAppointmentCalendarsForFlowResponse>(
            `/api/workspaces/${workspaceId}/appointment-calendars/for-flow`,
          )
          .json()

        set({ appointmentCalendars, loading: false })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch appointment calendars",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
