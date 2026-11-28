"use client"

import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { useQuery } from "@tanstack/react-query"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"

type ChannelPostSummaryProps = {
  channelPostId: string
}

/**
 * The picked post of a `sendChannelPost` step: thumbnail, first caption line
 * and the inbox it belongs to. A post that is gone (removed on the channel, or
 * not found in this workspace) is said so instead of left blank.
 */
export function ChannelPostSummary({ channelPostId }: ChannelPostSummaryProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const post = useQuery({
    ...orpc.channelPostManagementAPIs.privateGetPickerChannelPostAPI.queryOptions(
      { input: { id: channelPostId, workspaceId } },
    ),
    enabled: channelPostId !== "" && Boolean(workspaceId),
    retry: false,
  })

  if (channelPostId === "") {
    return (
      <span className="text-muted-foreground text-xs">
        {t("flows.sendChannelPost.select")}
      </span>
    )
  }
  if (post.isPending) {
    return <Skeleton className="h-12 w-full" />
  }
  if (post.isError || !post.data) {
    return (
      <span className="text-destructive text-xs" role="alert">
        {t("flows.sendChannelPost.unavailable")}
      </span>
    )
  }
  const { caption, inboxName, thumbnailUrl } = post.data

  return (
    <span className="flex w-full items-center gap-2 text-start">
      {thumbnailUrl ? (
        <Image
          alt=""
          className="size-12 shrink-0 rounded object-cover"
          height={48}
          src={thumbnailUrl}
          width={48}
        />
      ) : (
        <span className="size-12 shrink-0 rounded bg-muted" />
      )}
      <span className="flex min-w-0 flex-col">
        <span className="line-clamp-2 text-sm">
          {caption?.trim() || t("flows.sendChannelPost.noCaption")}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          {inboxName}
        </span>
      </span>
    </span>
  )
}
