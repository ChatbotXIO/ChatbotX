"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"
import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import {
  SiInstagram,
  SiMessenger,
  SiWhatsapp,
} from "@icons-pack/react-simple-icons"
import { formatDistanceToNowStrict } from "date-fns"
import { GlobeIcon, UsersRoundIcon } from "lucide-react"
import { useMemo } from "react"
import type { ContactResource } from "../contacts/schemas"
import type { ConversationResource } from "./schemas"

type ConversationItemProps = {
  conversation: ConversationResource
  isActive: boolean
  onSelect: () => void
}

const AssignedIcon = ({
  conversation,
}: {
  conversation: ConversationResource
}) => {
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

  return null
}

const SourceIcon = ({ contact }: { contact: ContactResource | null }) => {
  if (!contact) {
    return <GlobeIcon />
  }

  switch (contact.source) {
    case "Whatsapp":
      return <SiWhatsapp />
    case "Instagram":
      return <SiInstagram />
    case "Messenger":
      return <SiMessenger />
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
  const lastMessage = conversation.messages?.[0]
  const isSeen = useMemo(() => {
    if (!lastMessage?.createdAt) {
      return true
    }
    return (conversation.agentLastSeenAt ?? new Date()) >= lastMessage.createdAt
  }, [conversation.agentLastSeenAt, lastMessage?.createdAt])

  const contactFullName = conversation.contact?.fullName ?? ""
  const lastMessageContent = lastMessage?.content ?? " "
  const lastMessageTime = lastMessage?.createdAt ?? new Date()

  const contactAvatar = useMemo(
    () => (
      <Avatar className="h-12 w-12">
        <AvatarImage
          alt={contactFullName}
          src={conversation.contact?.avatar ?? ""}
        />
        <AvatarFallback className="bg-zinc-500">
          {contactFullName.charAt(0)}
        </AvatarFallback>
      </Avatar>
    ),
    [contactFullName, conversation.contact?.avatar],
  )

  return (
    <div className="w-full">
      <Button
        aria-label={`Open conversation with ${contactFullName}`}
        className="h-auto w-full justify-center px-3 py-2 font-normal"
        onClick={onSelect}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="-translate-x-1/2 absolute bottom-0 left-1/2 translate-y-1/2 transform">
            <AssignedIcon conversation={conversation} />
          </div>
          <div className="absolute right-0 bottom-0 transform">
            <SourceIcon contact={conversation.contact ?? null} />
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
              !isSeen && "font-semibold",
            )}
          >
            {lastMessageContent}
          </p>
          <p className="text-right text-xs">
            <time>
              {/* <time dateTime={lastMessageTime.toISOString()}> */}
              {formatDistanceToNowStrict(lastMessageTime)}
            </time>
          </p>
        </div>
      </Button>
    </div>
  )
}
