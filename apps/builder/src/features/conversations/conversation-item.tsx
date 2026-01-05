"use client"

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
import {
  SiInstagram,
  SiInstagramHex,
  SiMessenger,
  SiMessengerHex,
  SiWhatsapp,
  SiWhatsappHex,
} from "@icons-pack/react-simple-icons"
import { formatDistanceToNowStrict, isAfter } from "date-fns"
import { GlobeIcon, StarIcon, UsersRoundIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "../contacts/schemas/resource"
import { getAvatarUrl, getFullName } from "../contacts/utils"
import type { MessageResource } from "../messages/schemas"
import { readConversationAction } from "./actions/read-conversation.action"
import type { ConversationResource } from "./schemas/resource"

type ConversationItemProps = {
  conversation: ConversationResource
  onSelect: () => void
}

const assignedIcon = (conversation: ConversationResource) => {
  if (conversation.assignedUserId) {
    return (
      <Avatar className="h-4 w-4">
        <AvatarImage src={conversation.assignedUser?.image ?? ""} />

        <Tooltip>
          <TooltipTrigger asChild>
            <AvatarFallback className="text-xs">
              {conversation.assignedUser?.name?.slice(0, 2) ?? " "}
            </AvatarFallback>
          </TooltipTrigger>
          <TooltipContent align="center" side="bottom">
            {conversation.assignedUser?.name ||
              conversation.assignedUser?.email ||
              "User"}
          </TooltipContent>
        </Tooltip>
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
      return <SiWhatsapp fill={SiWhatsappHex} />
    case "Instagram":
      return <SiInstagram fill={SiInstagramHex} />
    case "Messenger":
      return <SiMessenger fill={SiMessengerHex} />
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
  onSelect,
}: ConversationItemProps) {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const [lastMessage, _setLastMessage] = useState<MessageResource | undefined>(
    conversation.messages?.[0],
  )
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
        <AvatarFallback className="bg-zinc-500">
          {getFullName(conversation.contact).charAt(0)}
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

  useEffect(() => {
    if (isActive) {
      execute()
    }
  }, [isActive, execute])

  return (
    <div className="w-full">
      <Button
        className="h-auto w-full justify-center px-3 py-2 font-normal"
        onClick={() => onSelect()}
        type="button"
        variant={isActive ? "secondary" : "ghost"}
      >
        <div className="relative">
          {contactAvatar}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 transform">
            {assignedIcon(conversation)}
          </div>
          <div className="absolute right-0 bottom-0 transform">
            {/* biome-ignore lint/style/noNonNullAssertion: wip */}
            {sourceIcon(conversation.contact!)}
          </div>
          {conversation.followed && (
            <div className="absolute bottom-0 left-0 transform">
              <StarIcon className="fill-yellow-400 text-yellow-400" />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-hidden">
          <div className="flex justify-between">
            <span className="truncate text-left font-semibold">
              {contactFullName}
            </span>
          </div>
          <p
            className={cn(
              "w-full truncate text-left text-sm",
              !(
                conversation.agentLastSeenAt && conversation.contactLastSeenAt
              ) ||
                (conversation.agentLastSeenAt &&
                  conversation.contactLastSeenAt &&
                  isAfter(
                    conversation.agentLastSeenAt,
                    conversation.contactLastSeenAt,
                  ))
                ? "text-gray-500"
                : "font-semibold",
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
