"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ConversationResource } from "@/features/conversations/schemas/get-conversations-schema"
import {
  AssignedType,
  type Contact,
  type Conversation,
} from "@ahachat.ai/database"
import { formatDistanceToNow } from "date-fns"
import { CheckCircleIcon, UsersRoundIcon } from "lucide-react"
import { useMemo, useState } from "react"

interface ConversationItemProps {
  conversation: ConversationResource
  isActive: boolean
  onSelect: () => void
}

const assignedIcon = (conversation: ConversationResource) => {
  return (
    <>
      {conversation.contact.assignedType === AssignedType.User ? (
        <Avatar>
          <AvatarImage src={conversation.contact.assignedUser?.image ?? ""} />
          <AvatarFallback>
            {conversation.contact.assignedUser?.name ?? " "}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="rounded-full border bg-secondary overflow-hidden">
          <UsersRoundIcon size={16} strokeWidth={1} />
        </div>
      )}
    </>
  )
}

export default function ConversationItem({
  conversation,
  isActive,
  onSelect,
}: ConversationItemProps) {
  const [hasSeen] = useState<boolean>(
    !!conversation.contactLastSeenAt &&
      !!conversation.agentLastSeenAt &&
      conversation.contactLastSeenAt > conversation.agentLastSeenAt,
  )

  const getFullName = (contact: Contact): string => {
    const { firstName, lastName, phoneNumber } = contact

    let fullName: string = [firstName, lastName].filter((v) => !!v).join(" ")
    if (!fullName) {
      fullName = phoneNumber || ""
    }

    return fullName
  }

  const getLatestSeenAt = (conversation: Conversation): Date | null => {
    if (!conversation.contactLastSeenAt && !conversation.agentLastSeenAt) {
      return null
    }

    if (!conversation.contactLastSeenAt || !conversation.agentLastSeenAt) {
      return conversation.contactLastSeenAt || conversation.agentLastSeenAt
    }

    return conversation.contactLastSeenAt > conversation.agentLastSeenAt
      ? conversation.contactLastSeenAt
      : conversation.agentLastSeenAt
  }

  const contactFullName = getFullName(conversation.contact)
  const latestSeenAt = getLatestSeenAt(conversation)
  const unreadCount = useMemo(() => {
    return conversation.unreadCount > 9 ? "9+" : conversation.unreadCount
  }, [conversation])

  return (
    <div
      className="px-2 py-1 w-full"
      onClick={() => onSelect()}
      onKeyUp={() => {}}
    >
      <Button
        variant={isActive ? "secondary" : "ghost"}
        className="h-auto w-full justify-center font-normal py-3"
      >
        <div className="relative">
          <Avatar className="w-12 h-12">
            <AvatarImage
              src={conversation.contact.avatar ?? ""}
              alt={contactFullName}
            />
            <AvatarFallback>{contactFullName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
            {assignedIcon(conversation)}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between">
            <span className="text-left font-semibold truncate">
              {contactFullName}
            </span>
            {!!unreadCount && (
              <Badge
                variant="destructive"
                className="rounded- px-1 font-normal"
              >
                {unreadCount}
              </Badge>
            )}
          </div>
          <p className="text-left text-sm text-gray-600 w-full truncate">
            {conversation.latestMessage?.content}
          </p>
          <div className="flex gap-2 items-center">
            {latestSeenAt && (
              <div className="flex-1 text-gray-500 truncate text-xs text-right">
                {formatDistanceToNow(latestSeenAt, { addSuffix: true })}
              </div>
            )}
            {hasSeen ? (
              <div className="absolute bottom-2.5 right-2.5">
                <Avatar className="w-3 h-3">
                  <AvatarImage
                    src={conversation.contact.avatar ?? ""}
                    alt={contactFullName}
                  />
                  <AvatarFallback>{contactFullName.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
            ) : (
              <CheckCircleIcon size={13} color="gray" />
            )}
          </div>
        </div>
      </Button>
    </div>
  )
}
