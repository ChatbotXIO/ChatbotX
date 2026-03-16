"use client"

import { channelType } from "@aha.chat/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@aha.chat/ui/components/ui/tooltip"
import { cn } from "@aha.chat/ui/lib/utils"
import { formatDistanceToNowStrict, isAfter } from "date-fns"
import { StarIcon, UsersRoundIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { useChatStore } from "../chat/store/chat-store-provider"
import { getAvatarUrl, getFullName } from "../contacts/utils"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { readConversationAction } from "./actions/read-conversation.action"
import type { ListConversationItemResource } from "./schemas/resource"

type ConversationItemProps = {
  conversation: ListConversationItemResource
  onSelect: () => void
}

const assignedIcon = (conversation: ListConversationItemResource) => {
  if (conversation.assignedUserId) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className="size-4">
            <AvatarImage src={conversation.assignedUser?.image ?? ""} />

            <AvatarFallback className="text-[0.5rem]">
              {conversation.assignedUser?.name?.slice(0, 2) ?? " "}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent align="center" side="bottom">
          {conversation.assignedUser?.name ||
            conversation.assignedUser?.email ||
            "User"}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (conversation.assignedInboxTeamId) {
    return (
      <div className="overflow-hidden rounded-full border border-zinc-600 bg-secondary">
        <UsersRoundIcon size={16} strokeWidth={1} />
      </div>
    )
  }
  return
}

export default function ConversationItem({
  conversation,
  onSelect,
}: ConversationItemProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const lastMessage = conversation.messages?.[0]
  const { activeConversationId, readConversation } = useChatStore(
    (state) => state,
  )
  const isActive = conversation.id === activeConversationId

  const contactFullName = useMemo(
    () => getFullName(conversation.contact),
    [conversation.contact],
  )

  const contactAvatar = useMemo(
    () => (
      <Avatar className="h-12 w-12">
        <AvatarImage
          alt={getFullName(conversation.contact)}
          className="object-cover"
          src={getAvatarUrl(conversation.contact)}
        />
        <AvatarFallback className="bg-gray-300 dark:bg-zinc-100 dark:text-zinc-800">
          {getFullName(conversation.contact).slice(0, 2)}
        </AvatarFallback>
      </Avatar>
    ),
    [conversation.contact],
  )

  const { execute } = useAction(
    readConversationAction.bind(null, chatbotId, conversation.id),
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
          <div className="absolute bottom-0 left-0 transform">
            {assignedIcon(conversation)}
          </div>
          <div className="absolute right-0 bottom-0 transform">
            <InboxIcon
              channel={conversation.inbox?.channel ?? channelType.omnichannel}
              showLabel={false}
            />
          </div>
          {conversation.followed && (
            <div className="absolute top-0 right-0 transform">
              <StarIcon className="fill-yellow-400 text-zinc-500" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="truncate text-left font-medium">
            {contactFullName}
          </div>
          <div
            className={cn(
              "w-full truncate text-left text-sm",
              !(
                conversation.agentLastReadAt && conversation.contactLastReadAt
              ) ||
                (conversation.agentLastReadAt &&
                  conversation.contactLastReadAt &&
                  isAfter(
                    conversation.agentLastReadAt,
                    conversation.contactLastReadAt,
                  ))
                ? "text-gray-500"
                : "font-semibold",
            )}
          >
            {conversation.messages?.[0]?.content ?? " "}
          </div>
          <p className="text-right text-neutral-400 text-xs">
            <span>
              {formatDistanceToNowStrict(
                lastMessage?.createdAt ? lastMessage.createdAt : new Date(),
              )}
            </span>
          </p>
        </div>
      </Button>
    </div>
  )
}
