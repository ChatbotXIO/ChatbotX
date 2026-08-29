"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import Link from "next/link"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useAvatarUrl } from "../utils"

type ContactNameCellContact = {
  avatar?: string | null
  fullName?: string | null
}

export function ContactNameCell({
  contact,
  conversationId,
  workspaceId,
  unknownContactLabel = "",
  channel,
  avatarClassName = "size-8",
  maxWidthClassName = "max-w-56",
}: {
  contact: ContactNameCellContact
  conversationId?: string | null
  workspaceId: string
  unknownContactLabel?: string
  channel?: ChannelType
  avatarClassName?: string
  maxWidthClassName?: string
}) {
  const avatarUrl = useAvatarUrl(contact as Parameters<typeof useAvatarUrl>[0])
  const name = contact.fullName ?? unknownContactLabel
  const inboxHref = conversationId
    ? `/space/${workspaceId}/inbox?conversationId=${conversationId}`
    : null

  const content = (
    <div className={`flex items-center gap-3 ${maxWidthClassName}`}>
      <div className="relative">
        <Avatar className={`${avatarClassName} shrink-0`}>
          <AvatarImage alt={name} className="object-cover" src={avatarUrl} />
          <AvatarFallback className="bg-gray-300 text-sm dark:bg-zinc-100 dark:text-zinc-800">
            {name.slice(0, 2) || "?"}
          </AvatarFallback>
        </Avatar>
        {channel && (
          <div className="absolute end-0 bottom-0 ltr:translate-x-1 rtl:-translate-x-1">
            <InboxIcon
              channel={channel}
              iconClassName="size-3"
              showLabel={false}
              size="small"
            />
          </div>
        )}
      </div>
      <span className="truncate font-medium leading-5">{name}</span>
    </div>
  )

  const trigger = inboxHref ? (
    <Link href={inboxHref} prefetch={false} target="_blank">
      {content}
    </Link>
  ) : (
    content
  )

  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent>{name}</TooltipContent>
    </Tooltip>
  )
}
