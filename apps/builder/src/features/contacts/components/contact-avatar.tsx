"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { channelTypes } from "@chatbotx.io/utils/channel"
import { useAvatarUrl } from "@/features/contacts/utils"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { initials } from "../lib/initials"

type ContactAvatarProps = {
  contact: { avatar: string | null; channel: string | null } | null
  name: string
  className?: string
}

/** A contact's avatar with the brand badge of its most recently active channel. */
export function ContactAvatar({
  contact,
  name,
  className,
}: ContactAvatarProps) {
  const avatarUrl = useAvatarUrl(contact)
  const channel = channelTypes.safeParse(contact?.channel)

  return (
    <span className="relative shrink-0">
      <Avatar className={cn("size-8", className)}>
        <AvatarImage alt="" src={avatarUrl} />
        <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
      </Avatar>
      {channel.success ? (
        <InboxIcon
          channel={channel.data}
          iconClassName="size-3.5"
          showLabel={false}
          size="small"
          wrapperClassName="-end-1 -bottom-1 absolute rounded-full bg-card p-px"
        />
      ) : null}
    </span>
  )
}
