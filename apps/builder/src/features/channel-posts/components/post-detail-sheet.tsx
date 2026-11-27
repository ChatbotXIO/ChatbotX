"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeIcon,
  ImageIcon,
  MessageCircleIcon,
  PhoneIcon,
  RefreshCwIcon,
  Share2Icon,
  SmileIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { PostPerformance } from "@/features/post-analytics/components/post-performance"
import { useClipboard } from "@/hooks/use-clipboard"
import type { useChannelCommentExport } from "../hooks/use-channel-comment-export"
import { useDownloadPostsExport } from "../hooks/use-download-posts-export"
import { useManagedPostActions } from "../hooks/use-managed-post-actions"
import { capabilityOfChannel } from "../lib/post-capability"
import { resolvePostTile } from "../lib/post-type-style"
import { PostAuthorValue } from "./post-author-label"
import { PostDownloadItems } from "./post-download-items"
import type { ManagedPost } from "./post-row"
import { PostTopicBadges, PostTopicPicker } from "./post-topic-picker"

type SettingKey = "hideComments" | "hidePhoneComments" | "skipComments"

type SettingRow = {
  description: string
  key: SettingKey
  label: string
}

const Metric = ({
  icon: MetricIcon,
  label,
  value,
}: {
  icon: typeof SmileIcon
  label: string
  /** `null` when the channel does not report this number. */
  value: number | null
}) => (
  <div className="rounded-xl border bg-muted/30 p-3">
    <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <MetricIcon aria-hidden="true" className="size-3.5" />
      {label}
    </div>
    <p className="mt-1 font-semibold text-lg">{value ?? "—"}</p>
  </div>
)

const InfoRow = ({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) => (
  <div className="flex items-baseline justify-between gap-4 py-2 text-sm">
    <dt className="shrink-0 text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words text-end">{children}</dd>
  </div>
)

type PostDetailBodyProps = {
  canViewPhones: boolean
  channelExport: ReturnType<typeof useChannelCommentExport>
  onOpenComments: (post: ManagedPost) => void
  post: ManagedPost
  readOnly: boolean
  workspaceId: string
}

const PostDetailBody = ({
  canViewPhones,
  channelExport,
  onOpenComments,
  post,
  readOnly,
  workspaceId,
}: PostDetailBodyProps) => {
  const t = useTranslations()
  const format = useFormatter()
  const { handleCopy } = useClipboard()
  const actions = useManagedPostActions(workspaceId)
  const storedExport = useDownloadPostsExport(workspaceId)

  const capability = capabilityOfChannel(post.channel)
  const reportsCounts = capability?.counts === true
  const settingsEnabled = capability?.commentSettings === true && !readOnly
  const display = resolvePostTile(post)

  const settings: SettingRow[] = [
    {
      description: t("posts.detail.skipCommentsHint"),
      key: "skipComments",
      label: t("posts.settings.skipComments"),
    },
    {
      description: t("posts.detail.hideCommentsHint"),
      key: "hideComments",
      label: t("posts.settings.hideComments"),
    },
    {
      description: t("posts.detail.hidePhoneCommentsHint"),
      key: "hidePhoneComments",
      label: t("posts.settings.hidePhoneComments"),
    },
  ]

  return (
    <>
      <SheetHeader className="border-b p-5">
        <SheetTitle>{t("posts.detail.title")}</SheetTitle>
        <SheetDescription>
          {channelLabel(post.channel)} · {post.inboxName}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-6 p-5">
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl bg-muted">
            {post.thumbnailUrl ? (
              // biome-ignore lint/performance/noImgElement: external platform thumbnail
              <img
                alt=""
                className="max-h-64 w-full object-cover"
                height={256}
                loading="lazy"
                src={post.thumbnailUrl}
                width={512}
              />
            ) : (
              <div className="flex h-40 items-center justify-center text-muted-foreground">
                <ImageIcon className="size-8" />
              </div>
            )}
            <div className="absolute start-3 top-3 flex gap-1.5">
              {display ? (
                <Badge className="gap-1 border-0 bg-background/90 text-foreground">
                  <display.tile.icon className="size-3" />
                  {t(`posts.${display.labelKey}`)}
                </Badge>
              ) : null}
              {post.liveStatus === "live" ? (
                <Badge variant="destructive">{t("posts.liveNow")}</Badge>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="mb-1 font-medium text-muted-foreground text-xs">
              {t("posts.detail.caption")}
            </h3>
            <p
              className={cn(
                "max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm",
                !post.caption && "text-muted-foreground",
              )}
            >
              {post.caption || t("posts.noCaption")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {post.permalink ? (
              <Button
                nativeButton={false}
                render={
                  // biome-ignore lint/a11y/useAnchorContent: the button supplies the label
                  <a
                    href={post.permalink}
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                }
                size="sm"
                variant="outline"
              >
                <ExternalLinkIcon />
                {t("posts.actions.viewOriginal")}
              </Button>
            ) : null}
            <Button
              onClick={() => onOpenComments(post)}
              size="sm"
              variant="outline"
            >
              <MessageCircleIcon />
              {t("posts.actions.viewComments")}
            </Button>
          </div>
        </div>

        <section>
          <h3 className="mb-2 font-semibold text-sm">
            {t("posts.detail.metrics")}
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Metric
              icon={MessageCircleIcon}
              label={t("posts.counts.comments")}
              value={reportsCounts ? post.commentsCount : null}
            />
            <Metric
              icon={SmileIcon}
              label={t("posts.counts.reactions")}
              value={reportsCounts ? post.reactionsCount : null}
            />
            <Metric
              icon={Share2Icon}
              label={t("posts.counts.shares")}
              value={reportsCounts ? post.sharesCount : null}
            />
            <Metric
              icon={EyeIcon}
              label={t("posts.detail.views")}
              value={post.viewsCount}
            />
            <Metric
              icon={PhoneIcon}
              label={t("posts.counts.phones")}
              value={post.phoneCommentsCount}
            />
          </div>
          {reportsCounts ? null : (
            <p className="mt-2 text-muted-foreground text-xs">
              {t("posts.detail.metricsUnavailable")}
            </p>
          )}
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-sm">
            {t("posts.analytics.perPost.title")}
          </h3>
          <p className="mb-2 text-muted-foreground text-xs">
            {t("posts.analytics.perPost.description")}
          </p>
          <PostPerformance postId={post.id} workspaceId={workspaceId} />
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-sm">
            {t("posts.detail.settings")}
          </h3>
          <p className="mb-2 text-muted-foreground text-xs">
            {capability?.commentSettings
              ? t("posts.detail.settingsHint")
              : t("posts.settings.unavailable")}
          </p>
          <ul className="divide-y rounded-xl border">
            {settings.map((setting) => (
              <li className="flex items-center gap-4 p-3" key={setting.key}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{setting.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {setting.description}
                  </p>
                </div>
                <Switch
                  aria-label={setting.label}
                  checked={post[setting.key]}
                  disabled={!settingsEnabled || actions.isSaving}
                  onCheckedChange={(checked) =>
                    actions.save(post.id, { [setting.key]: checked })
                  }
                />
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="mb-2 font-semibold text-sm">
            {t("posts.detail.topics")}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            <PostTopicBadges topics={post.topics} />
            <PostTopicPicker
              disabled={actions.isSaving || readOnly}
              onChange={(topicIds) => actions.save(post.id, { topicIds })}
              selected={post.topics}
              workspaceId={workspaceId}
            />
          </div>
        </section>

        <section>
          <h3 className="mb-1 font-semibold text-sm">
            {t("posts.detail.info")}
          </h3>
          <dl className="divide-y">
            <InfoRow label={t("posts.detail.postId")}>
              <button
                className="inline-flex items-center gap-1.5 font-mono text-xs hover:text-primary"
                onClick={() => handleCopy(post.externalPostId)}
                title={t("actions.copyId")}
                type="button"
              >
                {post.externalPostId}
                <CopyIcon className="size-3.5 shrink-0" />
              </button>
            </InfoRow>
            <InfoRow label={t("posts.detail.channel")}>
              {channelLabel(post.channel)}
            </InfoRow>
            <InfoRow label={t("posts.filters.inbox")}>{post.inboxName}</InfoRow>
            <InfoRow label={t("posts.detail.contentType")}>
              {post.contentType
                ? t(`posts.contentType.${post.contentType}`)
                : (post.mediaType ?? "—")}
            </InfoRow>
            <InfoRow label={t("posts.detail.author")}>
              <span className="flex min-w-0 items-center justify-end gap-2">
                <PostAuthorValue post={post} />
              </span>
            </InfoRow>
            <InfoRow label={t("posts.detail.publishedAt")}>
              {post.publishedAt
                ? format.dateTime(post.publishedAt, {
                    dateStyle: "long",
                    timeStyle: "short",
                  })
                : "—"}
            </InfoRow>
            <InfoRow label={t("posts.detail.metricsUpdated")}>
              {post.metricsFetchedAt
                ? format.dateTime(post.metricsFetchedAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : t("posts.detail.never")}
            </InfoRow>
          </dl>
        </section>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            disabled={readOnly || actions.refreshing}
            onClick={() => actions.refresh(post.id)}
            size="sm"
            variant="outline"
          >
            <RefreshCwIcon />
            {t("posts.actions.refreshPost")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline">
                  <DownloadIcon />
                  {t("posts.actions.download")}
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-60">
              <PostDownloadItems
                canViewContactData={canViewPhones}
                channelExport={channelExport}
                post={post}
                readOnly={readOnly}
                storedExport={storedExport}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </>
  )
}

/**
 * Everything the channel's listing reports about one post, its topics, and the
 * per-post comment settings (switches that apply to new comments).
 */
export const PostDetailSheet = ({
  canViewPhones,
  channelExport,
  onOpenChange,
  onOpenComments,
  post,
  readOnly,
  workspaceId,
}: {
  canViewPhones: boolean
  channelExport: ReturnType<typeof useChannelCommentExport>
  onOpenChange: (open: boolean) => void
  onOpenComments: (post: ManagedPost) => void
  post: ManagedPost | null
  readOnly: boolean
  workspaceId: string
}) => (
  <Sheet onOpenChange={onOpenChange} open={post !== null}>
    <SheetContent className="w-full gap-0 overflow-y-auto p-0 sm:max-w-lg">
      {post ? (
        <PostDetailBody
          canViewPhones={canViewPhones}
          channelExport={channelExport}
          onOpenComments={onOpenComments}
          post={post}
          readOnly={readOnly}
          workspaceId={workspaceId}
        />
      ) : null}
    </SheetContent>
  </Sheet>
)
