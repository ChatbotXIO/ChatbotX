"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

const SETTINGS_STALE_TIME_MS = 5 * 60 * 1000

/**
 * The workspace's translation settings. Long-lived on purpose: every Inbox
 * reads it, and a workspace with translation off must cost this one cached
 * query and nothing else. Invalidated when the settings are saved.
 */
export const useTranslationSettings = () => {
  const workspaceId = useWorkspaceId()
  return useQuery(
    orpc.translationAPI.getSettings.queryOptions({
      input: { workspaceId },
      staleTime: SETTINGS_STALE_TIME_MS,
    }),
  )
}

/** Call after any translation mutation, before `router.push` (invariant 21). */
export const useInvalidateTranslation = () => {
  const queryClient = useQueryClient()
  return useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.translationAPI.getSettings.key(),
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.translationAPI.getConversationState.key(),
        }),
      ]),
    [queryClient],
  )
}
