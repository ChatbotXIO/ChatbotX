"use client"

import { POST_PUBLISHING_RULES } from "@chatbotx.io/utils/post-publishing"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ExternalLinkIcon, Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ProviderNetworkIcon } from "@/features/social-accounts/components/provider-avatar"
import { orpc } from "@/lib/orpc/query"
import { useRemovalTracker } from "../hooks/use-removal-tracker"
import { useRemoveFromChannels } from "../hooks/use-remove-from-channels"
import { type ComposerPost, PROVIDER_LABELS } from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { failureText, postActionErrorMessage } from "../lib/quota-message"
import { PartStatusList } from "./part-status-list"
import { RemoveDialog } from "./remove-dialog"
import { RetryResolveActions } from "./retry-resolve-actions"

type TargetStatus = ComposerPost["targets"][number]["status"]

type PostTarget = ComposerPost["targets"][number]

/** A published destination on a network with a delete function, not yet taken down. */
const isRemovable = (target: PostTarget): boolean =>
  target.status === "published" &&
  !target.removedAt &&
  POST_PUBLISHING_RULES[target.provider].canRemove

const useStatusLabels = (): Record<TargetStatus, string> => {
  const t = useTranslations()
  return {
    cancelled: t("composer.status.cancelled"),
    failed: t("composer.status.failed"),
    needsReview: t("composer.status.needsReview"),
    pending: t("composer.status.pending"),
    processing: t("composer.status.processing"),
    published: t("composer.status.published"),
    publishing: t("composer.status.publishing"),
  }
}

/**
 * Where each destination of a saved post stands. A failed one can be retried;
 * one waiting for review can be retried or marked as published.
 */
export const TargetStatusList = ({
  disabled,
  post,
  workspaceId,
}: {
  disabled: boolean
  post: ComposerPost
  workspaceId: string
}) => {
  const t = useTranslations()
  const labels = useStatusLabels()
  const queryClient = useQueryClient()
  const refresh = () => invalidateSocialPost(queryClient, workspaceId, post.id)
  const mutationOptions = {
    onError: (error: Error) => toast.error(postActionErrorMessage(error, t)),
    onSuccess: refresh,
  }
  const retry = useMutation(
    orpc.socialPostsAPIs.privateRetrySocialPostTargetAPI.mutationOptions(
      mutationOptions,
    ),
  )
  const resolve = useMutation(
    orpc.socialPostsAPIs.privateResolveSocialPostTargetAPI.mutationOptions(
      mutationOptions,
    ),
  )
  const { removing, track } = useRemovalTracker({
    post,
    refetch: async () => {
      const startedAt = Date.now()
      const queryKey = orpc.socialPostsAPIs.privateGetSocialPostAPI.key({
        input: { id: post.id, workspaceId },
      })
      await queryClient.refetchQueries({ queryKey }, { cancelRefetch: false })
      const state = queryClient.getQueryState(
        orpc.socialPostsAPIs.privateGetSocialPostAPI.queryKey({
          input: { id: post.id, workspaceId },
        }),
      )
      return state?.status === "success" && state.dataUpdatedAt >= startedAt
    },
  })
  const removal = useRemoveFromChannels({
    onQueued: track,
    postId: post.id,
    workspaceId,
  })
  const busy =
    disabled || retry.isPending || resolve.isPending || removal.isPending
  const removableCount = post.targets.filter(isRemovable).length

  return (
    <section aria-labelledby="composer-status" className="space-y-2">
      <h2 className="font-semibold text-sm" id="composer-status">
        {t("composer.targetsStatus")}
      </h2>
      {removableCount > 1 ? (
        <RemoveDialog
          busy={busy}
          confirmLabel={t("composer.removeFromChannelsConfirm")}
          description={t("composer.removeFromChannelsDescription")}
          onConfirm={removal.removeAll}
          title={t("composer.removeFromChannelsTitle")}
          triggerLabel={t("composer.removeFromAllChannels")}
        />
      ) : null}
      <ul className="space-y-2">
        {post.targets.map((target) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm"
            key={target.id}
          >
            <ProviderNetworkIcon decorative provider={target.provider} />
            <span className="min-w-0 flex-1 truncate font-medium">
              {PROVIDER_LABELS[target.provider]} · {target.destination.name}
            </span>
            <span className="text-muted-foreground">
              {labels[target.status]}
            </span>
            {target.removedAt ? (
              <span className="text-muted-foreground">
                {t("composer.removedFromChannel")}
              </span>
            ) : null}
            {target.permalink && !target.removedAt ? (
              <a
                className="inline-flex items-center gap-1 text-primary underline"
                href={target.permalink}
                rel="noreferrer"
                target="_blank"
              >
                {t("composer.viewPost")}
                <ExternalLinkIcon className="size-3" />
              </a>
            ) : null}
            {removing.has(target.id) ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Loader2Icon aria-hidden className="size-3 animate-spin" />
                {t("composer.removing")}
              </span>
            ) : null}
            {isRemovable(target) ? (
              <RemoveDialog
                busy={busy || removing.has(target.id)}
                confirmLabel={t("composer.removeTargetConfirm")}
                description={t("composer.removeTargetDescription", {
                  destination: target.destination.name,
                  network: PROVIDER_LABELS[target.provider],
                })}
                onConfirm={() => removal.removeOne(target.id)}
                title={t("composer.removeTargetTitle", {
                  destination: target.destination.name,
                })}
                triggerLabel={t("composer.removeTarget")}
              />
            ) : null}
            {failureText(target, t) ? (
              <p className="w-full text-destructive">
                {failureText(target, t)}
              </p>
            ) : null}
            {target.parts.length > 0 ? (
              <PartStatusList
                busy={busy}
                labels={labels}
                onResolve={(partId) =>
                  resolve.mutate({
                    id: post.id,
                    outcome: "published",
                    partId,
                    targetId: target.id,
                    workspaceId,
                  })
                }
                onRetry={(partId) =>
                  retry.mutate({
                    id: post.id,
                    partId,
                    targetId: target.id,
                    workspaceId,
                  })
                }
                parts={target.parts}
              />
            ) : null}
            {(target.status === "failed" || target.status === "needsReview") &&
            !(target.externalPostId && target.parts.length > 0) ? (
              <RetryResolveActions
                busy={busy}
                canResolve={target.status === "needsReview"}
                onResolve={() =>
                  resolve.mutate({
                    id: post.id,
                    outcome: "published",
                    targetId: target.id,
                    workspaceId,
                  })
                }
                onRetry={() =>
                  retry.mutate({
                    id: post.id,
                    targetId: target.id,
                    workspaceId,
                  })
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
