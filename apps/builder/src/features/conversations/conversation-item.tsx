"use client"

import { Omnichannel } from "@aha.chat/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import { formatDistanceToNowStrict } from "date-fns"
import { UsersRoundIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { getAvatarUrl, getFullName } from "../contacts/utils"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import type { MessageResource } from "../messages/schemas"
import type { ConversationResource } from "./schemas/resource"

type ConversationItemProps = {
  conversation: ConversationResource
  isActive: boolean
  onSelect: () => void
}

const assignedIcon = (conversation: ConversationResource) => {
  if (conversation.assignedUserId) {
    return (
      <Avatar className="size-4">
        <AvatarImage src={conversation.assignedUser?.image ?? ""} />
        <AvatarFallback className="text-[9px]">
          {conversation.assignedUser?.name?.slice(0, 2) ?? " "}
        </AvatarFallback>
      </Avatar>
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
  isActive,
  onSelect,
}: ConversationItemProps) {
  const [lastMessage, _setLastMessage] = useState<MessageResource | undefined>(
    conversation.messages?.[0],
  )
  const [isSeen, _setIsSeen] = useState(
    (conversation.agentLastSeenAt ?? new Date()) >=
      (lastMessage?.createdAt ?? new Date()),
  )

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

  return (
    <div className="w-full">
      <Button
        className={cn(
          "h-auto w-full justify-center px-3 py-2 font-normal hover:bg-zinc-200 hover:text-foreground dark:hover:bg-muted",
          isActive ? "bg-zinc-200 dark:bg-muted!" : "",
        )}
        onClick={() => onSelect()}
        variant={"ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="absolute bottom-0 left-0 transform">
            {assignedIcon(conversation)}
          </div>
          <div className="absolute right-0 bottom-0 transform">
            <InboxIcon
              inboxType={conversation.inbox?.inboxType ?? Omnichannel}
              showLabel={false}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="truncate text-left font-medium">
            {contactFullName}
          </div>
          <div
            className={cn(
              "w-full truncate text-left text-neutral-400 text-sm",
              isSeen ? "font-medium" : "",
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
          {/* <div className="flex gap-2 items-center"> */}
          {/* {hasSeen ? (
              <div className="absolute bottom-2.5 right-2.5">
                {contactAvatar}
              </div>
            ) : (
              <CheckCircleIcon size={13} color="gray" />
            )} */}
          {/* </div> */}
        </div>
      </Button>
    </div>
  )
}
