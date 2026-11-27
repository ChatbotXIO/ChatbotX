"use client"

import type { ChannelPostRefreshOutcome } from "@chatbotx.io/utils/channel-post"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import type { ManagedPost } from "../components/post-row"

/** What one update call may change: a comment switch or the post's topics. */
export type ManagedPostChanges = Partial<
  Pick<ManagedPost, "hideComments" | "hidePhoneComments" | "skipComments">
> & { topicIds?: string[] }

/** The toast message of each outcome that is not a plain success (`refreshed` shows the new numbers instead). */
const REFRESH_OUTCOME_MESSAGES = {
  channelUnavailable: "posts.actions.refreshUnavailable",
  cooldown: "posts.actions.refreshCooldown",
  rateLimited: "posts.actions.refreshRateLimited",
  refreshed: null,
  removed: "posts.actions.refreshRemoved",
} as const satisfies Record<ChannelPostRefreshOutcome, string | null>

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
        onSuccess: (result) => {
          // The read already happened: the list and the open sheet show the new counts.
          queryClient.invalidateQueries({
            queryKey:
              orpc.channelPostManagementAPIs.privateListManagedChannelPostsAPI.key(),
          })
          const messageKey = REFRESH_OUTCOME_MESSAGES[result.outcome]
          if (messageKey) {
            toast.warning(t(messageKey))
          }
        },
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
