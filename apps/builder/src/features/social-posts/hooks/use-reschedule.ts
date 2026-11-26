import {
  type InfiniteData,
  type QueryKey,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { useRef } from "react"
import { toast } from "sonner"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import { applyReschedule, type RescheduleChange } from "../lib/calendar-items"
import { socialPostListQueryKeys } from "../lib/social-post-query-keys"
import type { listSocialPostsResponse } from "../schema"

type ListPage = z.infer<typeof listSocialPostsResponse>
type ListData = InfiniteData<ListPage>

/**
 * Moves a post, or one of its destinations, to another time (or back to
 * drafts). The lists show the move at once; a refusal puts them back and says
 * why (an expired workspace answers 402 with its own message).
 */
export const useReschedule = (workspaceId: string, timezone: string) => {
  const queryClient = useQueryClient()
  // What the lists held before the move, to put back when the server refuses it.
  const snapshots = useRef<[QueryKey, ListData | undefined][]>([])
  const listKey = orpc.socialPostsAPIs.privateListSocialPostsAPI.key()
  const rollback = (error: { message: string }): void => {
    for (const [key, data] of snapshots.current) {
      queryClient.setQueryData(key, data)
    }
    toast.error(error.message)
  }
  // Show the move in the lists at once, keeping what they held for a rollback.
  const applyOptimistically = async (change: RescheduleChange) => {
    await queryClient.cancelQueries({ queryKey: listKey })
    snapshots.current = queryClient.getQueriesData<ListData>({
      queryKey: listKey,
    })
    queryClient.setQueriesData<ListData>({ queryKey: listKey }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: applyReschedule(page.items, change),
            })),
          }
        : data,
    )
  }
  const refreshLists = () =>
    Promise.all(
      socialPostListQueryKeys().map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    )
  const move = useMutation(
    orpc.socialPostsAPIs.privateRescheduleSocialPostAPI.mutationOptions({
      onError: rollback,
      onMutate: (input) =>
        applyOptimistically({
          at: new Date(input.scheduledAt ?? Date.now()),
          kind: "schedule",
          postId: input.id,
          targetId: input.targetId ?? null,
        }),
      onSettled: refreshLists,
    }),
  )
  // Its own route: the plan gate lets "back to drafts" through on an expired workspace.
  const unschedule = useMutation(
    orpc.socialPostsAPIs.privateUnscheduleSocialPostAPI.mutationOptions({
      onError: rollback,
      onMutate: (input) =>
        applyOptimistically({
          kind: "unschedule",
          postId: input.id,
          targetId: null,
        }),
      onSettled: refreshLists,
    }),
  )

  const reschedule = (change: RescheduleChange): void => {
    if (change.kind === "unschedule") {
      unschedule.mutate({ id: change.postId, workspaceId })
      return
    }
    move.mutate({
      id: change.postId,
      scheduledAt: change.at.toISOString(),
      targetId: change.targetId ?? undefined,
      timezone,
      workspaceId,
    })
  }

  return { reschedule }
}
