"use client"

import { Conversation } from "../inbox/interfaces/conversation"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { AssignedType, Contact } from "@ahachat.ai/database"
import { formatDistanceToNow } from "date-fns"
import { CheckCircleIcon, UsersRoundIcon } from "lucide-react"
import { useState } from "react"

interface ConversationItemProps {
  conversation: Conversation
}

const assignedIcon = (conversation: Conversation) => {
  return (
    <>
      {
        conversation.assignedType === AssignedType.User ? (
          <Avatar>
            <AvatarImage src={conversation.assignedUser?.image} />
            <AvatarFallback>{(conversation.assignedUser?.firstName ?? " ")[0]}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="rounded-full border bg-secondary overflow-hidden">
            <UsersRoundIcon size={16} strokeWidth={1} />
          </div>
        )
      }
    </>
  )
}

export default function ConversationItem({ conversation }: ConversationItemProps) {
  const [hasSeen, setHasSeen] = useState<boolean>(conversation.contactLastSeenAt > conversation.lastMessageAt)

  const getFullName = (contact: Contact): string => {
    const { firstName, lastName, phoneNumber } = contact

    let fullName: string = [firstName, lastName].filter(v => !!v).join(" ")
    if (!fullName) {
      fullName = phoneNumber || ""
    }

    return fullName
  }
  const contactFullName = getFullName(conversation.contact)

  return (
    <div className="px-2 py-1 w-full">
      <Button
        variant={conversation.isActive ? "secondary" : "ghost"}
        className="h-auto w-full justify-center font-normal py-3"
      >
        <div className="relative">
          <Avatar className="w-12 h-12">
            <AvatarImage src={conversation.contact.avatar ?? ""} alt={contactFullName} />
            <AvatarFallback>{contactFullName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2">
            {assignedIcon(conversation)}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <p className="text-left font-semibold truncate">{contactFullName}</p>
          <p className="text-sm text-gray-600 w-full truncate">{conversation.lastMessage}</p>
          <div className="flex gap-2 items-center">
            <div className="flex-1 text-gray-500 truncate text-xs text-right">{formatDistanceToNow(conversation.lastActivityAt, { addSuffix: true })}</div>
            {
              hasSeen ? (
                <div className="absolute bottom-2.5 right-2.5">
                  <Avatar className="w-3 h-3">
                    <AvatarImage src={conversation.contact.avatar ?? ""} alt={contactFullName} />
                    <AvatarFallback>{(contactFullName).charAt(0)}</AvatarFallback>
                  </Avatar>
                </div>
              ) : <CheckCircleIcon size={13} color="gray" />
            }
          </div>
        </div>
      </Button>
    </div>
  )
}
