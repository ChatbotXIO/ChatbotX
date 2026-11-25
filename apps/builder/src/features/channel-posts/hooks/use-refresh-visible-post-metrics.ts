"use client"

import { useMutation } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { orpc } from "@/lib/orpc/query"
import {
  type MetricsAskedAt,
  selectMetricsRefreshIds,
} from "../lib/metrics-refresh-selection"

/** The rows of a page are loaded in bursts (paging, filter changes); wait for them to settle. */
const ASK_DEBOUNCE_MS = 600

/**
 * Asks the server for fresh counts of the posts the list shows: once per post
 * per 5 minutes per tab, in one request of at most 50 ids, after the rows
 * settle. The server reads the channel in the background and the list
 * refreshes through the realtime event when the counts arrive, so there is no
 * spinner and no message. A failed ask is ignored: the counts stay as stored.
 */
export const useRefreshVisiblePostMetrics = (input: {
  enabled: boolean
  visibleIds: readonly string[]
  workspaceId: string
}): void => {
  const { enabled, visibleIds, workspaceId } = input
  const askedAt = useRef<MetricsAskedAt>(new Map())
  const { mutate } = useMutation(
    orpc.channelPostManagementAPIs.privateRefreshChannelPostMetricsAPI.mutationOptions(),
  )
  const idsKey = visibleIds.join(",")

  // biome-ignore lint/correctness/useExhaustiveDependencies: idsKey stands for visibleIds
  useEffect(() => {
    if (!enabled || visibleIds.length === 0) {
      return
    }
    const timer = setTimeout(() => {
      const selection = selectMetricsRefreshIds({
        askedAt: askedAt.current,
        nowMs: Date.now(),
        visibleIds,
      })
      askedAt.current = selection.next
      if (selection.ids.length > 0) {
        mutate({ ids: selection.ids, workspaceId })
      }
    }, ASK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, idsKey, mutate, workspaceId])
}
