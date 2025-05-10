"use client"

import { InstagramIcon } from "@/components/icons/instagram"
import { MessengerIcon } from "@/components/icons/messenger"
import WhatsappIcon from "@/components/icons/whatsapp"
import { cn } from "@/components/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import type { ConversationResource } from "@/features/conversations/schemas/get-conversations.schema"
import {
  AssignedType,
  type Contact,
  type InboxTeam,
  type User,
} from "@ahachat.ai/database/types"
import { formatDistanceToNowStrict } from "date-fns"
import { GlobeIcon, UsersRoundIcon } from "lucide-react"
import { useMemo, useState } from "react"
import type { MessageResource } from "../messages/schemas/list-messages.schema"

interface ConversationItemProps {
  conversation: ConversationResource
  isActive: boolean
  onSelect: () => void
}

const assignedIcon = (
  contact: Contact & {
    assignedUser: User | null
    assignedTeam: InboxTeam | null
  },
) => {
  switch (contact.assignedType) {
    case AssignedType.USER:
      return (
        <Avatar className="w-4 h-4">
          <AvatarImage src={contact.assignedUser?.image ?? ""} />
          <AvatarFallback>
            {contact.assignedUser?.name?.slice(0, 2) ?? " "}
          </AvatarFallback>
        </Avatar>
      )
    case AssignedType.TEAM:
      return (
        <div className="rounded-full border border-zinc-600 bg-secondary overflow-hidden">
          <UsersRoundIcon size={16} strokeWidth={1} />
        </div>
      )
    default:
      return <></>
  }
}

const sourceIcon = (
  contact: Contact & {
    assignedUser: User | null
    assignedTeam: InboxTeam | null
  },
) => {
  switch (contact.source) {
    case "Whatsapp":
      return <WhatsappIcon />
    case "Instagram":
      return <InstagramIcon />
    case "Messenger":
      return <MessengerIcon />
    default:
      return (
        <div className="bg-white rounded-full">
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

  const contactFullName = useMemo(() => {
    return conversation.contact?.fullName ?? ""
  }, [conversation.contact])

  const contactAvatar = useMemo(() => {
    return (
      <Avatar className="w-12 h-12 ">
        <AvatarImage
          src={conversation.contact?.avatar ?? ""}
          alt={conversation.contact?.fullName}
        />
        <AvatarFallback className="bg-zinc-500">
          {conversation.contact?.fullName.charAt(0)}
        </AvatarFallback>
      </Avatar>
    )
  }, [conversation.contact])

  return (
    <div className="w-full" onClick={() => onSelect()} onKeyUp={() => {}}>
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className="h-auto w-full justify-center font-normal px-3 py-2"
      >
        <div className="relative">
          {contactAvatar}
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
            {/* biome-ignore lint/style/noNonNullAssertion: <explanation> */}
            {assignedIcon(conversation.contact!)}
          </div>
          <div className="absolute bottom-0 right-0 transform">
            {/* biome-ignore lint/style/noNonNullAssertion: <explanation> */}
            {sourceIcon(conversation.contact!)}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between">
            <span className="text-left font-semibold truncate">
              {contactFullName}
            </span>
          </div>
          <p
            className={cn(
              "text-sm text-gray-600 w-full text-left truncate",
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
