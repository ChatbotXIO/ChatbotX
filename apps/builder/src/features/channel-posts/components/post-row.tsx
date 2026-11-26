"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  CopyIcon,
  ExternalLinkIcon,
  EyeOffIcon,
  ImageIcon,
  InfoIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PhoneIcon,
  RefreshCwIcon,
  Share2Icon,
  SmileIcon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { z } from "zod"
import { useClipboard } from "@/hooks/use-clipboard"
import type { useChannelCommentExport } from "../hooks/use-channel-comment-export"
import { useDownloadPostsExport } from "../hooks/use-download-posts-export"
import { useManagedPostActions } from "../hooks/use-managed-post-actions"
import { capabilityOfChannel } from "../lib/post-capability"
import { resolvePostTile } from "../lib/post-type-style"
import type { channelPostManagementItem } from "../schema/management"
import { PostAuthorCell } from "./post-author-label"
import { PostDownloadItems } from "./post-download-items"
import { PostTopicBadges, PostTopicPicker } from "./post-topic-picker"

export type ManagedPost = z.infer<typeof channelPostManagementItem>

/**
 * Column widths of the channel posts table, shared by its header, rows and
 * skeleton. The fixed columns total 27.5rem (the author column's 10rem is its
 * minimum), so the post column never collapses; the author column and the post
 * column share what is left.
 */
export const POST_GRID =
  "grid grid-cols-1 items-center gap-3 md:grid-cols-[minmax(0,2fr)_11rem_minmax(10rem,1fr)_6.5rem] md:gap-0"

/** The narrowest the table gets before its section scrolls: the fixed columns plus 20rem for the post. */
export const POST_TABLE_MIN_WIDTH = "md:min-w-[47.5rem]"

const MAX_VISIBLE_TOPICS = 2

const Counter = ({
  icon: CounterIcon,
  label,
  onClick,
  value,
}: {
  icon: typeof SmileIcon
  label: string
  onClick?: () => void
  value: number
}) => {
  const content = (
    <>
      <CounterIcon aria-hidden="true" className="size-4" />
      {value}
      <span className="sr-only">{label}</span>
    </>
  )
  return onClick ? (
    <button
      className="flex items-center gap-1 rounded-sm transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      type="button"
    >
      {content}
    </button>
  ) : (
    <span className="flex items-center gap-1">{content}</span>
  )
}

export const PostRow = ({
  canViewPhones,
  channelExport,
  onOpenComments,
  onOpenDetail,
  post,
  readOnly,
  workspaceId,
}: {
  canViewPhones: boolean
  channelExport: ReturnType<typeof useChannelCommentExport>
  onOpenComments: (post: ManagedPost) => void
  onOpenDetail: (post: ManagedPost) => void
  post: ManagedPost
  readOnly: boolean
  workspaceId: string
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const { handleCopy } = useClipboard()
  const actions = useManagedPostActions(workspaceId)
  const storedExport = useDownloadPostsExport(workspaceId)
  const capability = capabilityOfChannel(post.channel)
  const settingsEnabled = capability?.commentSettings === true && !readOnly
  const display = resolvePostTile(post)
  const title = post.caption || t("posts.noCaption")

  return (
    <div
      className={cn(
        POST_GRID,
        "border-b px-5 py-4 transition-colors last:border-b-0 focus-within:bg-muted/40 hover:bg-muted/40",
      )}
    >
      <div className="flex min-w-0 gap-4">
        <button
          aria-label={t("posts.detail.title")}
          className="relative size-16 shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onOpenDetail(post)}
          type="button"
        >
          {post.thumbnailUrl ? (
            // biome-ignore lint/performance/noImgElement: external platform thumbnail
            <img
              alt=""
              className="size-16 rounded-lg object-cover"
              height={64}
              loading="lazy"
              src={post.thumbnailUrl}
              width={64}
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ImageIcon className="size-6" />
            </span>
          )}
          {display ? (
            <span
              className={cn(
                "absolute -end-1 -bottom-1 flex size-6 items-center justify-center rounded-md text-white ring-2 ring-card",
                display.tile.tone,
              )}
              title={t(`posts.${display.labelKey}`)}
            >
              <display.tile.icon className="size-3.5" />
            </span>
          ) : null}
        </button>
        <div className="min-w-0 space-y-1">
          <button
            className="block max-w-full truncate rounded-sm text-start font-semibold outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenDetail(post)}
            title={title}
            type="button"
          >
            {title}
          </button>
          {post.publishedAt ? (
            <p className="text-muted-foreground text-sm">
              {format.dateTime(post.publishedAt, {
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm md:flex-nowrap">
            <Counter
              icon={MessageCircleIcon}
              label={t("posts.counts.comments")}
              onClick={() => onOpenComments(post)}
              value={post.commentsCount}
            />
            <Counter
              icon={SmileIcon}
              label={t("posts.counts.reactions")}
              value={post.reactionsCount}
            />
            <Counter
              icon={Share2Icon}
              label={t("posts.counts.shares")}
              value={post.sharesCount}
            />
            <Counter
              icon={PhoneIcon}
              label={t("posts.counts.phones")}
              value={post.phoneCommentsCount}
            />
            <button
              className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => handleCopy(post.externalPostId)}
              title={t("actions.copyId")}
              type="button"
            >
              <CopyIcon className="size-4" />
              <span className="sr-only">{t("actions.copyId")}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1 px-0 md:px-4">
        <div className="flex min-w-0 gap-1 overflow-hidden">
          <PostTopicBadges topics={post.topics.slice(0, MAX_VISIBLE_TOPICS)} />
        </div>
        {post.topics.length > MAX_VISIBLE_TOPICS ? (
          <span className="shrink-0 text-muted-foreground text-xs">
            +{post.topics.length - MAX_VISIBLE_TOPICS}
          </span>
        ) : null}
        <PostTopicPicker
          disabled={actions.isSaving || readOnly}
          onChange={(topicIds) => actions.save(post.id, { topicIds })}
          selected={post.topics}
          workspaceId={workspaceId}
        />
      </div>

      <div className="min-w-0 px-0 md:px-4">
        <PostAuthorCell post={post} />
      </div>

      <div className="flex items-center justify-end gap-1 md:px-2">
        <Button
          aria-label={t("posts.settings.hideComments")}
          aria-pressed={post.hideComments}
          className={cn(
            "text-muted-foreground",
            post.hideComments && "bg-primary/10 text-primary",
          )}
          disabled={!settingsEnabled || actions.isSaving}
          onClick={() =>
            actions.save(post.id, { hideComments: !post.hideComments })
          }
          size="icon"
          title={settingsEnabled ? undefined : t("posts.settings.unavailable")}
          variant="ghost"
        >
          <EyeOffIcon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                className="text-muted-foreground"
                size="icon"
                variant="ghost"
              >
                <MoreHorizontalIcon />
                <span className="sr-only">{t("actions.openMenu")}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onClick={() => onOpenDetail(post)}>
              <InfoIcon />
              {t("posts.actions.viewDetails")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenComments(post)}>
              <MessageCircleIcon />
              {t("posts.actions.viewComments")}
            </DropdownMenuItem>
            {post.permalink ? (
              <DropdownMenuItem
                render={
                  // biome-ignore lint/a11y/useAnchorContent: the menu item supplies the label
                  <a
                    href={post.permalink}
                    rel="noopener noreferrer"
                    target="_blank"
                  />
                }
              >
                <ExternalLinkIcon />
                {t("posts.actions.viewOriginal")}
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              disabled={readOnly || actions.refreshing}
              onClick={() => actions.refresh(post.id)}
            >
              <RefreshCwIcon />
              {t("posts.actions.refreshPost")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
  )
}
