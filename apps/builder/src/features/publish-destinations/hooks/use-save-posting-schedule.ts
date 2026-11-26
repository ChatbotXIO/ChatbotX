import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { invalidatePublishDestinations } from "@/features/social-posts/lib/invalidate-publish-destinations"
import { socialPostListQueryKeys } from "@/features/social-posts/lib/social-post-query-keys"
import { orpc } from "@/lib/orpc/query"

/**
 * Saves a destination's posting schedule through the same operation as the
 * public PUT. The server re-seats the posts waiting in its queue in the same
 * step, so the lists and the free slots are refreshed and the result (posts
 * moved / posts that stopped being queued) is shown as a toast.
 */
export const useSavePostingSchedule = (onSaved: () => void) => {
  const t = useTranslations()
  const queryClient = useQueryClient()
  return useMutation(
    orpc.publishDestinationsAPIs.privateUpdatePostingScheduleAPI.mutationOptions(
      {
        onError: (error) => toast.error(error.message),
        onSuccess: async ({ reflow }) => {
          await Promise.all([
            invalidatePublishDestinations(queryClient),
            ...socialPostListQueryKeys().map((queryKey) =>
              queryClient.invalidateQueries({ queryKey }),
            ),
          ])
          toast.success(t("posts.connect.schedule.saved"))
          if (reflow.moved.length > 0) {
            toast.info(
              t("posts.connect.schedule.reflowMoved", {
                count: reflow.moved.length,
              }),
            )
          }
          if (reflow.detached.length > 0) {
            toast.warning(
              t("posts.connect.schedule.reflowDetached", {
                count: reflow.detached.length,
              }),
            )
          }
          onSaved()
        },
      },
    ),
  )
}
