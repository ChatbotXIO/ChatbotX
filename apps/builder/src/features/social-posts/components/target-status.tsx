"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { orpc } from "@/lib/orpc/query"
import { type ComposerPost, PROVIDER_LABELS } from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { failureText, postActionErrorMessage } from "../lib/quota-message"
import { PartStatusList } from "./part-status-list"
import { RetryResolveActions } from "./retry-resolve-actions"

type TargetStatus = ComposerPost["targets"][number]["status"]

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
  const [removeOpen, setRemoveOpen] = useState(false)
  const remove = useMutation(
    orpc.socialPostsAPIs.privateDeleteSocialPostAPI.mutationOptions({
      ...mutationOptions,
      onSuccess: async (result) => {
        setRemoveOpen(false)
        const targets = result.removal?.targets ?? []
        const queued = targets.filter((item) => item.status === "queued")
        const unsupported = targets.filter(
          (item) => item.status === "unsupported",
        )
        if (queued.length > 0) {
          toast.success(t("composer.removeRequested", { count: queued.length }))
        }
        if (unsupported.length > 0) {
          toast.warning(
            t("composer.removeUnsupported", { count: unsupported.length }),
          )
        }
        await refresh()
      },
    }),
  )
  const busy =
    disabled || retry.isPending || resolve.isPending || remove.isPending
  const canRemoveSome = post.targets.some(
    (target) => target.status === "published" && !target.removedAt,
  )

  return (
    <section aria-labelledby="composer-status" className="space-y-2">
      <h2 className="font-semibold text-sm" id="composer-status">
        {t("composer.targetsStatus")}
      </h2>
      {canRemoveSome ? (
        <AlertDialog onOpenChange={setRemoveOpen} open={removeOpen}>
          <AlertDialogTrigger
            render={
              <Button
                disabled={busy}
                size="sm"
                type="button"
                variant="outline"
              />
            }
          >
            {t("composer.removeFromChannels")}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("composer.removeFromChannelsTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("composer.removeFromChannelsDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>
                {t("composer.removeCancel")}
              </AlertDialogCancel>
              <Button
                disabled={busy}
                onClick={() =>
                  remove.mutate({
                    id: post.id,
                    removeFromChannels: true,
                    workspaceId,
                  })
                }
                type="button"
                variant="destructive"
              >
                {t("composer.removeFromChannelsConfirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <ul className="space-y-2">
        {post.targets.map((target) => (
          <li
            className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm"
            key={target.id}
          >
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
            {target.permalink ? (
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
