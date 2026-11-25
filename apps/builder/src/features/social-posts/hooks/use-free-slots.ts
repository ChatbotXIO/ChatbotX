import { useQueries } from "@tanstack/react-query"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { collectFreeSlotPages } from "../lib/calendar-free-slots"

const FREE_SLOT_STALE_MS = 30_000

export type DestinationFreeSlots = {
  destinationId: string
  isError: boolean
  isPending: boolean
  /** True when the period was not covered within the request budget. */
  isTruncated: boolean
  items: Date[]
  timezone: string | undefined
}

/**
 * The next free posting times of each destination's queue (the same read as the
 * public `listFreeSlots`). An empty list means the destination has no posting
 * schedule (or no free time within a year).
 */
export const useFreeSlots = ({
  after,
  destinationIds,
  enabled = true,
  limit,
  until,
  workspaceId,
}: {
  /** Only times after this instant; the server never goes earlier than now. */
  after?: Date
  destinationIds: readonly string[]
  enabled?: boolean
  limit: number
  /** Pages through the times (a bounded number of requests) until one reaches this instant. */
  until?: Date
  workspaceId: string
}): DestinationFreeSlots[] =>
  useQueries({
    queries: destinationIds.map((id) => {
      const input = { after, id, limit, workspaceId }
      if (!(until && after)) {
        return {
          ...orpc.publishDestinationsAPIs.privateListFreeSlotsAPI.queryOptions({
            input,
          }),
          enabled,
          staleTime: FREE_SLOT_STALE_MS,
        }
      }
      return {
        enabled,
        queryFn: async () =>
          await collectFreeSlotPages({
            fetchPage: async (pageAfter) =>
              await client.publishDestinationsAPIs.privateListFreeSlotsAPI({
                ...input,
                after: pageAfter,
              }),
            from: after,
            limit,
            until,
          }),
        queryKey: [
          ...orpc.publishDestinationsAPIs.privateListFreeSlotsAPI.queryKey({
            input,
          }),
          "paged",
          until.getTime(),
        ],
        staleTime: FREE_SLOT_STALE_MS,
      }
    }),
    combine: (results) =>
      results.map((result, index) => ({
        destinationId: destinationIds[index] ?? "",
        isError: result.isError,
        isPending: result.isPending,
        isTruncated: pagedTruncated(result.data),
        items: result.data?.items ?? [],
        timezone: result.data?.timezone,
      })),
  })

const pagedTruncated = (data: object | undefined): boolean =>
  data !== undefined && "isTruncated" in data && data.isTruncated === true

/** True when every destination has loaded and has at least one free posting time. */
export const allHaveFreeSlots = (
  slots: readonly DestinationFreeSlots[],
): boolean =>
  slots.length > 0 &&
  slots.every(
    (slot) => !(slot.isPending || slot.isError) && slot.items.length > 0,
  )
