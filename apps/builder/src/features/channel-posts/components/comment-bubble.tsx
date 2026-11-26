"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { EyeOffIcon, HeartIcon, PhoneIcon, Trash2Icon } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import type { z } from "zod"
import { MessageBubble } from "@/features/messages/components/message-bubble"
import { ProviderAvatar } from "@/features/social-accounts/components/provider-avatar"
import { providerOfPostChannel } from "../lib/post-provider"
import type { channelPostComment } from "../schema/management"

export type PostComment = z.infer<typeof channelPostComment>

type CommentSender = PostComment["sender"]

/** How a comment sits in the thread and looks, by who wrote it. */
const SENDER_STYLE: Record<
  CommentSender,
  { bubble: string; variant: "left" | "right" }
> = {
  contact: { bubble: "bg-card", variant: "left" },
  page: { bubble: "bg-primary/10", variant: "right" },
}

/** A round picture with the first letter of `name` while there is none. */
const InitialAvatar = ({
  avatar,
  name,
}: {
  avatar: string | null | undefined
  name: string
}) => (
  <Avatar aria-hidden="true" className="size-8 shrink-0">
    {avatar ? <AvatarImage alt="" src={avatar} /> : null}
    <AvatarFallback className="bg-muted font-medium text-xs">
      {name.slice(0, 1).toUpperCase()}
    </AvatarFallback>
  </Avatar>
)

/**
 * The picture of whoever wrote the comment, chosen by `sender` first: the page's
 * own comment shows the page (its brand mark, else its picture or initial) and
 * never a contact's picture.
 */
const CommentAvatar = ({
  channel,
  comment,
  name,
}: {
  channel: string
  comment: PostComment
  name: string
}) => {
  if (comment.sender === "contact") {
    return <InitialAvatar avatar={comment.author?.avatar} name={name} />
  }
  const provider = providerOfPostChannel(channel)
  if (provider) {
    return (
      <ProviderAvatar
        avatar={comment.page?.avatar ?? null}
        className="size-8"
        provider={provider}
      />
    )
  }
  return <InitialAvatar avatar={comment.page?.avatar} name={name} />
}

export const CommentBubble = ({
  canDelete,
  canLike,
  channel,
  comment,
  likeDisabled,
  onDelete,
  onLike,
  postCaption,
}: {
  canDelete: boolean
  canLike: boolean
  /** The channel of the comment's post, for the page's brand icon. */
  channel: string
  comment: PostComment
  likeDisabled: boolean
  onDelete: (comment: PostComment) => void
  onLike: (comment: PostComment) => void
  postCaption: string | null
}) => {
  const t = useTranslations()
  const format = useFormatter()
  const [confirming, setConfirming] = useState(false)
  const style = SENDER_STYLE[comment.sender]
  const isPage = comment.sender === "page"
  const name = isPage
    ? (comment.page?.name ?? "")
    : (comment.author?.name ?? t("posts.comments.unknownAuthor"))

  return (
    <MessageBubble
      className="group max-w-[90%] items-start"
      data-sender={comment.sender}
      variant={style.variant}
    >
      <CommentAvatar channel={channel} comment={comment} name={name} />
      <div
        className={cn(
          "min-w-0 space-y-1 rounded-xl border px-3 py-2 text-sm shadow-xs",
          style.bubble,
          comment.hidden && "opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{name}</span>
          {isPage ? null : (
            <>
              {comment.author?.phoneNumber ? (
                <Badge className="gap-1" variant="outline">
                  <PhoneIcon className="size-3" />
                  {comment.author.phoneNumber}
                </Badge>
              ) : null}
              {comment.author?.tags.map((tag) => (
                <Badge key={tag.id} variant="secondary">
                  {tag.name}
                </Badge>
              ))}
            </>
          )}
          {comment.hidden ? (
            <Badge className="gap-1" variant="outline">
              <EyeOffIcon className="size-3" />
              {t("posts.comments.hidden")}
            </Badge>
          ) : null}
        </div>
        {postCaption ? (
          <p className="truncate text-muted-foreground text-xs">
            {postCaption}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap break-words">{comment.text}</p>
        <div className="flex items-center gap-1 text-muted-foreground text-xs">
          {canLike && !isPage ? (
            <Button
              aria-label={t("posts.comments.like")}
              aria-pressed={comment.liked}
              className={cn("size-7", comment.liked && "text-red-500")}
              disabled={likeDisabled}
              onClick={() => onLike(comment)}
              size="icon"
              variant="ghost"
            >
              <HeartIcon className={cn(comment.liked && "fill-current")} />
            </Button>
          ) : null}
          <Button
            aria-label={t("posts.comments.delete")}
            className={cn("size-7", confirming && "text-destructive")}
            disabled={!canDelete}
            onBlur={() => setConfirming(false)}
            onClick={() => {
              if (confirming) {
                onDelete(comment)
              }
              setConfirming((value) => !value)
            }}
            size="icon"
            title={
              confirming
                ? t("posts.comments.confirmDelete")
                : t("posts.comments.delete")
            }
            variant="ghost"
          >
            <Trash2Icon />
          </Button>
          <time dateTime={comment.createdAt.toISOString()}>
            {format.dateTime(comment.createdAt, {
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              month: "short",
            })}
          </time>
        </div>
      </div>
    </MessageBubble>
  )
}
