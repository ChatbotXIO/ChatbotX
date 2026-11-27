"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import type { z } from "zod"
import { orpc } from "@/lib/orpc/query"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { postActionErrorMessage } from "../lib/quota-message"
import type { deleteSocialPostResponse } from "../schema/resource"

type RemovalResponse = z.infer<typeof deleteSocialPostResponse>

/**
 * Taking a published post down from its networks: from every destination at
 * once, or from one. Both report what was queued or cannot be removed, then
 * refresh the post (invariant 21); a worker finishes the removal later and the
 * realtime sync refreshes the page again.
 */
export const useRemoveFromChannels = ({
  onQueued,
  postId,
  workspaceId,
}: {
  /** The destinations a worker will now remove. */
  onQueued: (targetIds: string[]) => void
  postId: string
  workspaceId: string
}) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const options = {
    onError: (error: Error) => toast.error(postActionErrorMessage(error, t)),
    onSuccess: async (result: RemovalResponse) => {
      const targets = result.removal?.targets ?? []
      const queued = targets.filter((item) => item.status === "queued")
      const unsupported = targets.filter(
        (item) => item.status === "unsupported",
      )
      onQueued(queued.map((item) => item.targetId))
      if (queued.length > 0) {
        toast.success(t("composer.removeRequested", { count: queued.length }))
      }
      if (unsupported.length > 0) {
        toast.warning(
          t("composer.removeUnsupported", { count: unsupported.length }),
        )
      }
      await invalidateSocialPost(queryClient, workspaceId, postId)
    },
  }
  const all = useMutation(
    orpc.socialPostsAPIs.privateDeleteSocialPostAPI.mutationOptions(options),
  )
  const one = useMutation(
    orpc.socialPostsAPIs.privateRemoveSocialPostTargetAPI.mutationOptions(
      options,
    ),
  )

  return {
    isPending: all.isPending || one.isPending,
    removeAll: () =>
      all.mutate({ id: postId, removeFromChannels: true, workspaceId }),
    removeOne: (targetId: string) =>
      one.mutate({ id: postId, targetId, workspaceId }),
  }
}
