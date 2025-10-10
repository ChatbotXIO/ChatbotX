"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import { formatDistanceToNowStrict } from "date-fns"
import { GlobeIcon, UsersRoundIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { InstagramIcon } from "@/components/icons/instagram"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"
import type { ContactResource } from "../contacts/schemas"
import type { MessageResource } from "../messages/schemas"
import type { ConversationResource } from "./schemas"

type ConversationItemProps = {
  conversation: ConversationResource
  isActive: boolean
  onSelect: () => void
}

const assignedIcon = (conversation: ConversationResource) => {
  if (conversation.assignedUserId) {
    return (
      <Avatar className="h-4 w-4">
        <AvatarImage src={conversation.assignedUser?.image ?? ""} />
        <AvatarFallback>
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

const sourceIcon = (contact: ContactResource) => {
  switch (contact.source) {
    case "Whatsapp":
      return <WhatsappIcon />
    case "Instagram":
      return <InstagramIcon />
    case "Messenger":
      return <MessengerIcon />
    default:
      return (
        <div className="rounded-full bg-white">
          <GlobeIcon />
        </div>
      )
  }
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
    () => conversation.contact?.fullName ?? "",
    [conversation.contact],
  )

  const contactAvatar = useMemo(
    () => (
      <Avatar className="h-12 w-12">
        <AvatarImage
          alt={conversation.contact?.fullName}
          className="object-cover"
          src={conversation.contact?.avatarUrl ?? ""}
        />
        <AvatarFallback className="bg-zinc-500">
          {conversation.contact?.fullName.charAt(0)}
        </AvatarFallback>
      </Avatar>
    ),
    [conversation.contact],
  )

  return (
    <div className="w-full">
      <Button
        className="h-auto w-full justify-center px-3 py-2 font-normal"
        onClick={() => onSelect()}
        variant={isActive ? "secondary" : "ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="-translate-x-1/2 absolute bottom-0 left-1/2 translate-y-1/2 transform">
            {assignedIcon(conversation)}
          </div>
          <div className="absolute right-0 bottom-0 transform">
            {/* biome-ignore lint/style/noNonNullAssertion: wip */}
            {sourceIcon(conversation.contact!)}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between">
            <span className="truncate text-left font-semibold">
              {contactFullName}
            </span>
          </div>
          <p
            className={cn(
              "w-full truncate text-left text-gray-600 text-sm",
              isSeen ? "font-semibold" : "",
            )}
          >
            {conversation.messages?.[0]?.content ?? " "}
          </p>
          <p className="text-right text-xs">
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
