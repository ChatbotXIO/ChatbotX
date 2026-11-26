"use client"

import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { useChannelCommentExport } from "../hooks/use-channel-comment-export"
import type { useDownloadPostsExport } from "../hooks/use-download-posts-export"
import { canReadCommentsFromChannel } from "../lib/channel-export"
import type { PostsExportKind } from "../lib/posts-list-input"
import type { ManagedPost } from "./post-row"

type DownloadItem = {
  kind: PostsExportKind
  labelKey:
    | "posts.actions.downloadComments"
    | "posts.actions.downloadEmails"
    | "posts.actions.downloadPhones"
  /** Lists contact data: shown only to a member who may see phone numbers and emails. */
  requiresContactData: boolean
}

const DOWNLOAD_ITEMS: readonly DownloadItem[] = [
  {
    kind: "comments",
    labelKey: "posts.actions.downloadComments",
    requiresContactData: false,
  },
  {
    kind: "phones",
    labelKey: "posts.actions.downloadPhones",
    requiresContactData: true,
  },
  {
    kind: "emails",
    labelKey: "posts.actions.downloadEmails",
    requiresContactData: true,
  },
]

/**
 * The download items of a post's menu (row and detail panel): comments, phone
 * numbers and emails, each with the two places to take them from. "Stored
 * data" downloads what the inbox already holds at once; "Read from channel"
 * starts a background read of everything the channel has, offered only when
 * the post's channel can be read that way.
 */
export const PostDownloadItems = ({
  canViewContactData,
  channelExport,
  post,
  readOnly,
  storedExport,
}: {
  canViewContactData: boolean
  channelExport: ReturnType<typeof useChannelCommentExport>
  post: ManagedPost
  readOnly: boolean
  storedExport: ReturnType<typeof useDownloadPostsExport>
}) => {
  const t = useTranslations()
  const canReadFromChannel = canReadCommentsFromChannel(post.channel)
  // A download spends a message, so an expired workspace is refused by the server.
  const title = readOnly ? t("posts.export.blocked") : undefined

  return DOWNLOAD_ITEMS.filter(
    (item) => canViewContactData || !item.requiresContactData,
  ).map((item) => {
    if (!canReadFromChannel) {
      return (
        <DropdownMenuItem
          disabled={storedExport.isDownloading || readOnly}
          key={item.kind}
          onClick={() => storedExport.download(item.kind, [post.id])}
          title={title}
        >
          <DownloadIcon />
          {t(item.labelKey)}
        </DropdownMenuItem>
      )
    }
    return (
      <DropdownMenuSub key={item.kind}>
        <DropdownMenuSubTrigger>
          <DownloadIcon />
          {t(item.labelKey)}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuItem
            disabled={storedExport.isDownloading || readOnly}
            onClick={() => storedExport.download(item.kind, [post.id])}
            title={title}
          >
            {t("posts.export.sourceStored")}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={channelExport.isBusy || readOnly}
            onClick={() => channelExport.start(item.kind, [post.id])}
            title={title}
          >
            {t("posts.export.sourceChannel")}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    )
  })
}
