"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { formatDistanceToNowStrict, isAfter } from "date-fns"
import {
  MailIcon,
  MessageCircleMoreIcon,
  StarIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { useUserAvatarUrl } from "@/lib/auth/avatar"
import { useChatStore } from "../chat/store/chat-store-provider"
import { useAvatarUrl } from "../contacts/utils"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { readConversationAction } from "./actions/read-conversation.action"
import { resolveLastMessagePreview } from "./queries/resolve-last-message-preview"
import type { ListConversationItemResource } from "./schema/resource"

type ConversationItemProps = {
  conversation: ListConversationItemResource
  onSelect: () => void
}

const assignedIcon = (
  conversation: ListConversationItemResource,
  assignedAvatarUrl: string | undefined,
  t: ReturnType<typeof useTranslations>,
) => {
  if (conversation.assignedUserId) {
    const assignedUserName =
      conversation.assignedUser?.name ||
      conversation.assignedUser?.email ||
      t("assignAdmin.user")

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Avatar className="size-4">
              <AvatarImage src={assignedAvatarUrl ?? ""} />

              <AvatarFallback className="text-[0.5rem]">
                {conversation.assignedUser?.name?.slice(0, 2) ?? " "}
              </AvatarFallback>
            </Avatar>
          }
        />
        <TooltipContent align="center" side="bottom">
          {t("assignAdmin.assignedTo", { name: assignedUserName })}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (conversation.assignedInboxTeamId) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="overflow-hidden rounded-full border border-zinc-600 bg-secondary">
              <UsersRoundIcon size={16} strokeWidth={1} />
            </div>
          }
        />
        <TooltipContent align="center" side="bottom">
          {t("assignAdmin.assignedTo", {
            name:
              conversation.assignedInboxTeam?.name ?? t("fields.team.label"),
          })}
        </TooltipContent>
      </Tooltip>
    )
  }
  return
}

export default function ConversationItem({
  conversation,
  onSelect,
}: ConversationItemProps) {
  const t = useTranslations()
  const { activeConversationId, readConversation } = useChatStore(
    (state) => state,
  )
  const isActive = conversation.id === activeConversationId
  const isComment = conversation.messages?.[0]?.type === "comment"
  const avatarUrl = useAvatarUrl(conversation.contact)
  const assignedAvatarUrl = useUserAvatarUrl(conversation.assignedUser?.image)
  const previewText = resolveLastMessagePreview(conversation.messages?.[0], t)
  const isUnread = Boolean(
    conversation.agentLastReadAt &&
      conversation.contactLastReadAt &&
      !isAfter(conversation.agentLastReadAt, conversation.contactLastReadAt),
  )

  const contactAvatar = useMemo(
    () => (
      <Avatar
        className={cn("h-12 w-12", isUnread && "border-2 border-primary")}
      >
        <AvatarImage
          alt={conversation.contact?.fullName ?? ""}
          className="object-cover"
          src={avatarUrl}
        />
        <AvatarFallback className="bg-gray-300 dark:bg-zinc-100 dark:text-zinc-800">
          {conversation.contact?.fullName?.slice(0, 2)}
        </AvatarFallback>
      </Avatar>
    ),
    [conversation.contact, avatarUrl, isUnread],
  )

  const { execute } = useAction(
    readConversationAction.bind(
      null,
      conversation.workspaceId,
      conversation.id,
    ),
    {
      onSuccess: () => {
        readConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: execute is not a dependency
  useEffect(() => {
    if (isActive) {
      execute()
    }
  }, [isActive])

  return (
    <div className="w-full">
      <Button
        className={cn(
          "h-auto w-full justify-center px-3 py-2 font-normal hover:bg-zinc-200 hover:text-foreground dark:hover:bg-muted",
          isActive ? "bg-zinc-200 dark:bg-muted!" : "",
        )}
        onClick={() => onSelect()}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="absolute start-0 bottom-0 transform">
            {assignedIcon(conversation, assignedAvatarUrl, t)}
          </div>
          <div className="absolute end-0 bottom-0 transform">
            {conversation.contactInboxes?.map((contactInbox) => (
              <Tooltip key={contactInbox.id}>
                <TooltipTrigger
                  render={
                    <span>
                      <InboxIcon
                        channel={contactInbox.channel as ChannelType}
                        showLabel={false}
                        size="small"
                      />
                    </span>
                  }
                />
                <TooltipContent align="center" side="right">
                  {contactInbox.inbox.name}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
          {conversation.followed && (
            <div className="absolute end-0 top-0 transform">
              <StarIcon className="fill-yellow-400 text-zinc-500" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-start font-medium dark:text-gray-200">
              {conversation.contact?.fullName}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    {isComment ? (
                      <MessageCircleMoreIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <MailIcon className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </span>
                }
              />
              <TooltipContent align="center" side="top">
                {isComment
                  ? t("fields.comment.label")
                  : t("fields.directMessage.label")}
              </TooltipContent>
            </Tooltip>
          </div>
          <div
            className={cn(
              "w-full truncate text-start text-xs",
              isUnread ? "font-semibold" : "text-gray-500",
            )}
          >
            {previewText}
          </div>
          <p className="text-end text-neutral-400 text-xs">
            <span>
              {conversation.lastActivityAt
                ? formatDistanceToNowStrict(conversation.lastActivityAt)
                : " "}
            </span>
          </p>
        </div>
      </Button>
    </div>
  )
}
