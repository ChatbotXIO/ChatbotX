"use client"

import { buildPostLink } from "@chatbotx.io/business/utils"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import Image from "next/image"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"

export function ConversationInfo() {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { activePost, loadActivePost, activeConversationId, conversations } =
    useChatStore((state) => state)

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )
  const channel = activeConversation?.contactInboxes?.[0]?.channel as
    | ChannelType
    | undefined
  const postLink =
    activePost?.link ??
    (channel && activeConversation?.sourceId
      ? buildPostLink(channel, activeConversation.sourceId)
      : null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: reload on conversation change only
  useEffect(() => {
    loadActivePost(workspaceId)
  }, [activeConversationId])

  if (!activePost) {
    return null
  }

  return (
    <div className="border-b py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        {activePost.from?.name && (
          <span className="font-semibold text-foreground text-sm">
            {activePost.from.name}
          </span>
        )}
        {activePost.text && (
          <p className="whitespace-pre-line text-muted-foreground text-xs">
            {activePost.text}
          </p>
        )}
        {activePost.picture && (
          <Image
            alt=""
            className="shrink-0 rounded object-cover"
            height={56}
            src={activePost.picture}
            unoptimized
            width={56}
          />
        )}
        <span className="text-[11px] text-muted-foreground">
          {formatDate(activePost.createdAt, {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          })}
        </span>
        {postLink && (
          <Link
            className="text-[11px] text-primary hover:underline"
            href={postLink}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("messages.viewPost")}
          </Link>
        )}
      </div>
    </div>
  )
}
