"use client"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@chatbotx.io/ui/components/ui/alert-dialog"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { SocialPostBucket } from "@chatbotx.io/utils/social-post"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CopyIcon,
  ImageIcon,
  Loader2Icon,
  PencilIcon,
  RefreshCwIcon,
  Trash2Icon,
  VideoIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { toast } from "sonner"
import { POST_GRID } from "@/features/channel-posts/components/post-row"
import type { ComposedNarrowing } from "@/features/channel-posts/lib/posts-show"
import { ProviderAvatar } from "@/features/social-accounts/components/provider-avatar"
import { orpc } from "@/lib/orpc/query"
import { useComposedPosts } from "../hooks/use-calendar-posts"
import { useStatusLabel } from "../hooks/use-status-label"
import { STATUS_TONES } from "../lib/calendar-tones"
import {
  type ComposedPostBadge,
  composedPostBadge,
  composedPostTime,
  needsRetry,
} from "../lib/composed-post-row"
import type { ComposerPost } from "../lib/composer-state"
import { invalidateSocialPost } from "../lib/invalidate-social-post"
import { RetryReviewConfirmDialog } from "./retry-resolve-actions"

const BADGE_TONES = {
  draft: STATUS_TONES.draft,
  failed: STATUS_TONES.failed,
  published: STATUS_TONES.published,
  scheduled: STATUS_TONES.pending,
} as const satisfies Record<ComposedPostBadge, string>

const SKELETON_ROWS = 5
const MAX_VISIBLE_PAGES = 3

const Thumbnail = ({ post }: { post: ComposerPost }) => {
  const [first] = post.media
  if (first?.kind === "image") {
    return (
      // biome-ignore lint/performance/noImgElement: workspace media thumbnail
      <img
        alt=""
        className="size-16 shrink-0 rounded-lg object-cover"
        height={64}
        loading="lazy"
        src={first.url}
        width={64}
      />
    )
  }
  const Icon = first ? VideoIcon : ImageIcon
  return (
    <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <Icon className="size-6" />
    </span>
  )
}

const ComposedPostRow = ({
  post,
  readOnly,
  workspaceId,
}: {
  post: ComposerPost
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const router = useRouter()
  const queryClient = useQueryClient()
  const statusLabel = useStatusLabel()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRetry, setConfirmRetry] = useState(false)
  const [isRetrying, setIsRetrying] = useState(false)
  const refresh = () => invalidateSocialPost(queryClient, workspaceId, post.id)
  const onError = (error: Error) => toast.error(error.message)

  const duplicate = useMutation(
    orpc.socialPostsAPIs.privateDuplicateSocialPostAPI.mutationOptions({
      onError,
      onSuccess: async (copy) => {
        await refresh()
        router.push(`/space/${workspaceId}/posts/${copy.id}/edit`)
      },
    }),
  )
  const remove = useMutation(
    orpc.socialPostsAPIs.privateDeleteSocialPostAPI.mutationOptions({
      onError,
      onSuccess: async () => {
        setConfirmDelete(false)
        toast.success(t("posts.composed.deleted"))
        await refresh()
      },
    }),
  )
  const retry = useMutation(
    orpc.socialPostsAPIs.privateRetrySocialPostTargetAPI.mutationOptions({
      onError,
      onSuccess: refresh,
    }),
  )

  const badge = composedPostBadge(post)
  const at = composedPostTime(post)
  const editHref = `/space/${workspaceId}/posts/${post.id}/edit`
  const title = post.text?.trim() || t("posts.calendar.noText")
  const canDelete = post.status === "draft" || post.status === "scheduled"
  const retryTargets = post.targets.filter(needsRetry)
  // Retrying a destination waiting for review may post twice: ask first.
  const retryNeedsConfirm = retryTargets.some(
    (target) => target.status === "needsReview",
  )
  const busy =
    duplicate.isPending || remove.isPending || retry.isPending || isRetrying
  const retryAll = async () => {
    setIsRetrying(true)
    try {
      await Promise.allSettled(
        retryTargets.map((target) =>
          retry.mutateAsync({ id: post.id, targetId: target.id, workspaceId }),
        ),
      )
    } finally {
      setIsRetrying(false)
    }
  }
  const pages = post.targets.slice(0, MAX_VISIBLE_PAGES)

  return (
    <div
      className={cn(
        POST_GRID,
        "border-b px-5 py-4 transition-colors last:border-b-0 focus-within:bg-muted/40 hover:bg-muted/40",
      )}
    >
      <div className="flex min-w-0 gap-4">
        <Link className="shrink-0 rounded-lg" href={editHref}>
          <Thumbnail post={post} />
        </Link>
        <div className="min-w-0 space-y-1">
          <Link
            className="block max-w-full truncate rounded-sm font-semibold hover:text-primary hover:underline"
            href={editHref}
            title={title}
          >
            {title}
          </Link>
          {at ? (
            <p className="text-muted-foreground text-sm">
              {format.dateTime(at, {
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center md:border-s md:ps-4">
        <div className="flex -space-x-2">
          {pages.map((target) => (
            <span key={target.id} title={target.destination.name}>
              <ProviderAvatar
                avatar={target.destination.avatar}
                className="size-8 ring-2 ring-card"
                provider={target.provider}
              />
            </span>
          ))}
        </div>
        {post.targets.length > MAX_VISIBLE_PAGES ? (
          <span className="ms-2 text-muted-foreground text-xs">
            +{post.targets.length - MAX_VISIBLE_PAGES}
          </span>
        ) : null}
      </div>
      <div className="md:border-s md:ps-4">
        <span
          className={cn(
            "rounded px-2 py-0.5 font-medium text-xs",
            BADGE_TONES[badge],
          )}
        >
          {badge === "scheduled"
            ? t("posts.calendar.list.filters.scheduled")
            : statusLabel(badge)}
        </span>
      </div>
      <div className="flex items-center gap-1 md:border-s md:ps-4">
        <Link
          aria-label={t("actions.edit")}
          className={buttonVariants({ size: "icon", variant: "ghost" })}
          href={editHref}
          title={t("actions.edit")}
        >
          <PencilIcon />
        </Link>
        <Button
          aria-label={t("actions.duplicate")}
          disabled={busy || readOnly}
          onClick={() => duplicate.mutate({ id: post.id, workspaceId })}
          size="icon"
          title={t("actions.duplicate")}
          variant="ghost"
        >
          {duplicate.isPending ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <CopyIcon />
          )}
        </Button>
        {retryTargets.length > 0 ? (
          <Button
            aria-label={t("actions.retry")}
            disabled={busy || readOnly}
            onClick={() => {
              if (retryNeedsConfirm) {
                setConfirmRetry(true)
              } else {
                retryAll()
              }
            }}
            size="icon"
            title={t("actions.retry")}
            variant="ghost"
          >
            <RefreshCwIcon />
          </Button>
        ) : null}
        {canDelete ? (
          <Button
            aria-label={t("actions.delete")}
            disabled={busy || readOnly}
            onClick={() => setConfirmDelete(true)}
            size="icon"
            title={t("actions.delete")}
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
        ) : null}
      </div>
      <RetryReviewConfirmDialog
        busy={busy}
        onConfirm={retryAll}
        onOpenChange={setConfirmRetry}
        open={confirmRetry}
      />
      <AlertDialog onOpenChange={setConfirmDelete} open={confirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("posts.composed.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("posts.composed.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <Button
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: post.id, workspaceId })}
              variant="destructive"
            >
              {t("actions.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const EMPTY_KEYS = {
  drafts: "posts.calendar.list.empty.drafts",
  needsAttention: "posts.calendar.list.empty.needsAttention",
  published: "posts.calendar.list.empty.published",
  scheduled: "posts.calendar.list.empty.scheduled",
} as const satisfies Record<SocialPostBucket, string>

/**
 * The composed posts of one bucket in the Posts tab's table frame: Post, Pages,
 * Status and Actions columns, newest first, paged with "Load more".
 */
export const ComposedPostsTable = ({
  bucket,
  narrowing,
  readOnly,
  workspaceId,
}: {
  bucket: SocialPostBucket
  narrowing: ComposedNarrowing
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const posts = useComposedPosts(workspaceId, bucket, narrowing)

  return (
    <div>
      <div
        className={cn(
          POST_GRID,
          "hidden border-b px-5 py-5 font-semibold text-sm md:grid",
        )}
      >
        <span>{t("posts.columns.content")}</span>
        <span className="border-s ps-4">{t("posts.columns.pages")}</span>
        <span className="border-s ps-4">{t("posts.columns.status")}</span>
        <span className="border-s ps-4">{t("actions.actions")}</span>
      </div>
      {posts.isLoading
        ? Array.from({ length: SKELETON_ROWS }, (_, index) => (
            <div
              className={cn(POST_GRID, "border-b px-5 py-4")}
              key={`skeleton-${index.toString()}`}
            >
              <div className="flex gap-3">
                <Skeleton className="size-16 rounded-lg" />
                <Skeleton className="h-4 w-64 max-w-full" />
              </div>
              <Skeleton className="hidden h-8 w-20 md:block" />
              <Skeleton className="hidden h-6 w-20 md:block" />
              <Skeleton className="hidden size-8 md:block" />
            </div>
          ))
        : posts.posts.map((post) => (
            <ComposedPostRow
              key={post.id}
              post={post}
              readOnly={readOnly}
              workspaceId={workspaceId}
            />
          ))}
      {posts.isError ? (
        <div className="flex items-center justify-center gap-2 p-6 text-destructive text-sm">
          {t("posts.calendar.loadError")}
          <Button onClick={() => posts.refetch()} size="sm" variant="ghost">
            {t("posts.calendar.retry")}
          </Button>
        </div>
      ) : null}
      {!(posts.isLoading || posts.isError) && posts.posts.length === 0 ? (
        <p className="p-6 text-center text-muted-foreground text-sm">
          {t(EMPTY_KEYS[bucket])}
        </p>
      ) : null}
      {posts.hasMore ? (
        <div className="flex justify-center border-t p-4">
          <Button
            disabled={posts.isLoadingMore}
            onClick={posts.loadMore}
            variant="outline"
          >
            {posts.isLoadingMore ? (
              <Loader2Icon className="animate-spin" />
            ) : null}
            {t("posts.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
