"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef } from "react"
import { getMissedCommentsInProgressAction } from "./actions/get-missed-comments-in-progress.action"

/** How often the status is re-read while a run is still processing. */
const MISSED_COMMENTS_POLL_INTERVAL_MS = 5000

const missedCommentsInProgressQueryKey = (workspaceId: string) =>
  ["missed-comments-in-progress", workspaceId] as const

/**
 * The listed automations that are processing missed comments. Polls only while
 * at least one is, and refreshes the server-rendered list once when one
 * finishes so its delivery columns catch up with the replies just sent.
 *
 * `refresh` re-reads the status at once — call it after starting a run so the
 * "processing" label shows without waiting for the next poll.
 */
export function useMissedCommentsInProgress(
  workspaceId: string,
  automationIds: string[],
) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const idsKey = [...automationIds].sort().join(",")

  const query = useQuery({
    queryKey: [...missedCommentsInProgressQueryKey(workspaceId), idsKey],
    queryFn: async () => {
      const result = await getMissedCommentsInProgressAction(workspaceId, {
        ids: automationIds,
      })
      if (!result?.data) {
        throw new Error(
          result?.serverError ?? "get-missed-comments-in-progress-failed",
        )
      }
      return result.data.ids
    },
    enabled: automationIds.length > 0,
    refetchInterval: (current) =>
      current.state.data?.length ? MISSED_COMMENTS_POLL_INTERVAL_MS : false,
  })

  const inProgress = useMemo(() => new Set(query.data ?? []), [query.data])

  const previouslyInProgress = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!query.data) {
      return
    }
    const listed = new Set(idsKey.split(","))
    const finishedAny = [...previouslyInProgress.current].some(
      (id) => listed.has(id) && !inProgress.has(id),
    )
    previouslyInProgress.current = inProgress
    if (finishedAny) {
      router.refresh()
    }
  }, [query.data, inProgress, idsKey, router])

  const refresh = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: missedCommentsInProgressQueryKey(workspaceId),
      }),
    [queryClient, workspaceId],
  )

  return { inProgress, refresh }
}
