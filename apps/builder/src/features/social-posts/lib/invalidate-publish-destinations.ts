import type { QueryClient } from "@tanstack/react-query"
import { orpc } from "@/lib/orpc/query"

/**
 * Refreshes every publish-destination read (picker, target cards, schedules,
 * Connect tab). Call it after any reconnect or disconnect: one reconnect can
 * change the state of several destinations.
 */
export const invalidatePublishDestinations = async (
  queryClient: QueryClient,
): Promise<void> => {
  await queryClient.invalidateQueries({
    queryKey: orpc.publishDestinationsAPIs.key(),
  })
}
