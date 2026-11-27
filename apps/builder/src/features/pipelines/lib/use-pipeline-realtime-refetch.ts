"use client"

import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { useQueryClient } from "@tanstack/react-query"
import { useRef } from "react"
import { useWorkspaceRealtimeEvents } from "@/features/realtime/use-workspace-realtime-events"
import { orpc } from "@/lib/orpc/query"

/** Realtime bursts collapse into one refetch, but never wait longer than the cap. */
const REFETCH_DEBOUNCE_MS = 400
const REFETCH_MAX_WAIT_MS = 2000

/**
 * The reads an item change can alter. Pipeline settings, fields, members and
 * the option lists are untouched by item events, so they are not refetched.
 */
const ITEM_DATA_QUERY_KEYS = [
  orpc.pipelinesAPI.privateGetBoardAPI.key(),
  orpc.pipelinesAPI.privateGetItemAPI.key(),
  orpc.pipelinesAPI.privateListItemActivityAPI.key(),
  orpc.pipelinesAPI.privateListItemCommentsAPI.key(),
  orpc.pipelinesAPI.privateListContactItemsAPI.key(),
  orpc.pipelinesAPI.privateGetStatsAPI.key(),
  orpc.pipelinesAPI.privateListPipelinesAPI.key(),
]

/**
 * An event without `itemId` is pipeline-wide (stage or field edits, a bulk
 * stage job), so the reads that list stages and fields refetch too.
 */
const STRUCTURE_QUERY_KEYS = [
  orpc.pipelinesAPI.privateGetPipelineAPI.key(),
  orpc.pipelinesAPI.privateListPipelineOptionsAPI.key(),
]

type PipelineItemChangedEvent = Parameters<
  NonNullable<
    Parameters<typeof useWorkspaceRealtimeEvents>[0]["pipelineItemChanged"]
  >
>[0]

/**
 * Refetches the item reads on screen, debounced, when a `pipelineItemChanged`
 * realtime event matches `isRelevant`.
 */
export function usePipelineRealtimeRefetch(
  isRelevant: (event: PipelineItemChangedEvent) => boolean,
) {
  const queryClient = useQueryClient()
  const structureChanged = useRef(false)
  const queueRefetch = useDebouncedCallback(
    () => {
      const queryKeys = structureChanged.current
        ? [...ITEM_DATA_QUERY_KEYS, ...STRUCTURE_QUERY_KEYS]
        : ITEM_DATA_QUERY_KEYS
      structureChanged.current = false
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey })
      }
    },
    REFETCH_DEBOUNCE_MS,
    REFETCH_MAX_WAIT_MS,
  )
  useWorkspaceRealtimeEvents({
    pipelineItemChanged: (event) => {
      if (isRelevant(event)) {
        structureChanged.current ||= !event.data.itemId
        queueRefetch()
      }
    },
  })
}
