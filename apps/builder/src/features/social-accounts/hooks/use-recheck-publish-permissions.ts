"use client"

import { useMutation } from "@tanstack/react-query"
import { useEffect } from "react"
import { orpc } from "@/lib/orpc/query"
import { decideRecheckAsk, type RecheckAskedAt } from "../lib/scope-recheck-ask"

/** The destinations load in bursts (reconnect return, refetch); wait for them to settle. */
const ASK_DEBOUNCE_MS = 600

/**
 * Per tab, in memory: survives leaving and re-entering the Connect tab, not a
 * reload. The server dedupes per destination for 10 minutes as well.
 */
let askedAt: RecheckAskedAt = new Map()

/**
 * Asks the server to re-read, from the platform, the permissions of the
 * destinations the Connect tab shows: once per workspace per 10 minutes per tab,
 * after the list settles. No spinner and no message: the server queues a
 * background read and tells the open page through the realtime event the tab
 * already refetches on. A failed ask is ignored: the stored permissions stay.
 */
export const useRecheckPublishPermissions = (input: {
  destinationIds: readonly string[]
  enabled: boolean
  workspaceId: string
}): void => {
  const { destinationIds, enabled, workspaceId } = input
  const { mutate } = useMutation(
    orpc.publishDestinationsAPIs.privateRecheckPublishPermissionsAPI.mutationOptions(),
  )
  const idsKey = destinationIds.join(",")

  // biome-ignore lint/correctness/useExhaustiveDependencies: idsKey stands for destinationIds
  useEffect(() => {
    if (!enabled || destinationIds.length === 0) {
      return
    }
    const timer = setTimeout(() => {
      const decision = decideRecheckAsk({
        askedAt,
        ids: destinationIds,
        nowMs: Date.now(),
        workspaceId,
      })
      askedAt = decision.next
      if (decision.ids.length > 0) {
        mutate({ ids: decision.ids, workspaceId })
      }
    }, ASK_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [enabled, idsKey, mutate, workspaceId])
}
