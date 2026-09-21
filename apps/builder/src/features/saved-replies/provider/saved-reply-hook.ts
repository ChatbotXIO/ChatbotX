import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import { orpc } from "@/lib/orpc/query"
import type { ListSavedReplyResponse } from "../schema/mutation"
import type { SavedReplyResource } from "../schema/resource"

export const useSavedReplies = (
  workspaceId: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery(
    orpc.savedRepliesAPI.listSavedRepliesAuthorizedAPI.queryOptions({
      input: { workspaceId: workspaceId ?? "" },
      enabled: Boolean(workspaceId) && (options?.enabled ?? true),
      select: (response) => response.data,
    }),
  )

export type SavedReplyCache = {
  upsert: (savedReply: SavedReplyResource) => void
  remove: (id: string) => void
}

export const useSavedReplyCache = (workspaceId: string | undefined) => {
  const queryClient = useQueryClient()
  const queryKey = useMemo(
    () =>
      orpc.savedRepliesAPI.listSavedRepliesAuthorizedAPI.queryKey({
        input: { workspaceId: workspaceId ?? "" },
      }),
    [workspaceId],
  )

  const upsert = useCallback(
    (savedReply: SavedReplyResource) => {
      queryClient.setQueryData<ListSavedReplyResponse>(queryKey, (response) => {
        const savedReplies = response?.data ?? []
        const existingIndex = savedReplies.findIndex(
          (item) => item.id === savedReply.id,
        )

        if (existingIndex === -1) {
          return { data: [savedReply, ...savedReplies] }
        }

        return {
          data: savedReplies.map((item) =>
            item.id === savedReply.id ? savedReply : item,
          ),
        }
      })
    },
    [queryClient, queryKey],
  )

  const remove = useCallback(
    (id: string) => {
      queryClient.setQueryData<ListSavedReplyResponse>(
        queryKey,
        (response) => ({
          data: (response?.data ?? []).filter((item) => item.id !== id),
        }),
      )
    },
    [queryClient, queryKey],
  )

  return { upsert, remove }
}
