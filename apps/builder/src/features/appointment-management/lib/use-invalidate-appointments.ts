import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { orpc } from "@/lib/orpc/query"

/**
 * Call after an appointment is created: the contact panel list refetches now
 * and availability is marked stale for the next picker. `router.refresh()`
 * does not touch the TanStack cache (AGENTS.md invariant 21).
 */
export const useInvalidateAppointments = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.appointmentsAPI.key(),
        }),
        // Mark stale only: the create dialog is usually still open (and its
        // query enabled) when this runs, so an eager refetch would compute up
        // to 90 days of slots just before the dialog closes and discard them.
        // The next time a picker mounts it refetches the stale data.
        queryClient.invalidateQueries({
          queryKey:
            orpc.appointmentCalendarsAPI.getContactAvailabilityAPI.key(),
          refetchType: "none",
        }),
      ]),
    [queryClient],
  )
}
