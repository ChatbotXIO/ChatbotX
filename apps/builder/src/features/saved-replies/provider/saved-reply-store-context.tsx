"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { useEnsureQueryLoaded } from "@/hooks/use-ensure-query-loaded"
import { orpc } from "@/lib/orpc/query"
import type { ListSavedReplyResponse } from "../schema/mutation"
import type { SavedReplyResource } from "../schema/resource"

type SavedReplyStoreSnapshot = {
  initialized: boolean
  isLoading: boolean
  workspaceId: string
  savedReplies: SavedReplyResource[]
  error: string | null
  initialize: () => Promise<unknown>
  getAllSavedReplies: () => Promise<unknown>
  deleteSavedReply: (id: string) => void
  upsertSavedReply: (savedReply: SavedReplyResource) => void
}

export const useSavedReplyStore = <T,>(
  selector: (store: SavedReplyStoreSnapshot) => T,
): T => {
  const workspaceId = useWorkspaceId()
  const queryClient = useQueryClient()
  const queryOptions = useMemo(
    () =>
      orpc.savedRepliesAPI.listSavedRepliesAuthorizedAPI.queryOptions({
        input: { workspaceId: workspaceId ?? "" },
        enabled: false,
      }),
    [workspaceId],
  )
  const savedRepliesQuery = useQuery(queryOptions)
  const getAllSavedReplies = useEnsureQueryLoaded(savedRepliesQuery)

  const deleteSavedReply = useCallback(
    (id: string) => {
      queryClient.setQueryData<ListSavedReplyResponse>(
        queryOptions.queryKey,
        (response) => ({
          data: (response?.data ?? []).filter((item) => item.id !== id),
        }),
      )
    },
    [queryClient, queryOptions.queryKey],
  )

  const upsertSavedReply = useCallback(
    (savedReply: SavedReplyResource) => {
      queryClient.setQueryData<ListSavedReplyResponse>(
        queryOptions.queryKey,
        (response) => {
          const currentItems = response?.data ?? []
          const existingIndex = currentItems.findIndex(
            (item) => item.id === savedReply.id,
          )
          if (existingIndex === -1) {
            return { data: [savedReply, ...currentItems] }
          }
          return {
            data: currentItems.map((item) =>
              item.id === savedReply.id ? savedReply : item,
            ),
          }
        },
      )
    },
    [queryClient, queryOptions.queryKey],
  )

  const snapshot = useMemo<SavedReplyStoreSnapshot>(
    () => ({
      initialized: savedRepliesQuery.isFetched,
      isLoading: savedRepliesQuery.isFetching,
      workspaceId: workspaceId ?? "",
      savedReplies: savedRepliesQuery.data?.data ?? [],
      error: savedRepliesQuery.error?.message ?? null,
      initialize: getAllSavedReplies,
      getAllSavedReplies,
      deleteSavedReply,
      upsertSavedReply,
    }),
    [
      deleteSavedReply,
      getAllSavedReplies,
      savedRepliesQuery.data,
      savedRepliesQuery.error,
      savedRepliesQuery.isFetched,
      savedRepliesQuery.isFetching,
      upsertSavedReply,
      workspaceId,
    ],
  )

  return selector(snapshot)
}
