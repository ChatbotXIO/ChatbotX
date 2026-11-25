"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import type { ManagedPost } from "../components/post-row"

/** What one update call may change: a comment switch or the post's topics. */
export type ManagedPostChanges = Partial<
  Pick<ManagedPost, "hideComments" | "hidePhoneComments" | "skipComments">
> & { topicIds?: string[] }

/**
 * The write actions of one managed post, shared by the list row and the detail
 * panel so both invalidate the same queries (a toggle in one shows in the other).
 */
export const useManagedPostActions = (workspaceId: string) => {
  const t = useTranslations()
  const queryClient = useQueryClient()

  const update = useMutation(
    orpc.channelPostManagementAPIs.privateUpdateManagedChannelPostAPI.mutationOptions(
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () =>
          queryClient.invalidateQueries({
            queryKey:
              orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
          }),
      },
    ),
  )
  const refresh = useMutation(
    orpc.channelPostManagementAPIs.privateRefreshManagedChannelPostAPI.mutationOptions(
      {
        onError: (error) => toast.error(error.message),
        onSuccess: () => toast.success(t("posts.actions.refreshQueued")),
      },
    ),
  )

  return {
    isSaving: update.isPending,
    refresh: (postId: string) => refresh.mutate({ id: postId, workspaceId }),
    refreshing: refresh.isPending,
    save: (postId: string, changes: ManagedPostChanges) =>
      update.mutate({ id: postId, workspaceId, ...changes }),
  }
}
