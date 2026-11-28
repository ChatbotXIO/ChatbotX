"use client"

import type { MessageChannelPostEntity } from "@chatbotx.io/sdk"
import { ExternalLinkIcon } from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"

type ChannelPostCardProps = {
  post: MessageChannelPostEntity
  /** The message's own text: for a `textLink` share, what the customer received. */
  sentText?: string | null
}

/**
 * The post an outgoing message shared, as stored on the row when it was sent:
 * thumbnail, caption and a link to the post. A snapshot, so the card still
 * reads after the post changes or goes away.
 */
export function ChannelPostCard({ post, sentText }: ChannelPostCardProps) {
  const t = useTranslations()
  const caption = post.caption?.trim() || t("flows.sendChannelPost.noCaption")
  const text = sentText?.trim()
  const sentTextLink = post.shareMode === "textLink" && text ? text : null

  return (
    <div className="mt-1 flex w-60 max-w-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground">
      {post.thumbnail ? (
        <Image
          alt=""
          className="h-40 w-full object-cover"
          height={160}
          src={post.thumbnail}
          width={240}
        />
      ) : null}
      <div className="flex flex-col gap-1 p-2">
        {sentTextLink ? (
          <p className="whitespace-pre-line break-words text-sm [overflow-wrap:anywhere]">
            {sentTextLink}
          </p>
        ) : (
          <p className="line-clamp-3 text-sm">{caption}</p>
        )}
        {post.permalink ? (
          <a
            className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
            href={post.permalink}
            rel="noopener noreferrer"
            target="_blank"
          >
            <ExternalLinkIcon aria-hidden className="size-3" />
            {t("flows.sendChannelPost.openPost")}
          </a>
        ) : null}
      </div>
    </div>
  )
}
