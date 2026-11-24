"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useUserAvatarUrl } from "@/lib/auth/avatar"
import type { ConversationParticipantResource } from "../schema/resource"

type ParticipantAvatarProps = {
  className?: string
  participant: Pick<ConversationParticipantResource, "image" | "name">
}

/** A member's round avatar; the one place the image key becomes a URL. */
export function ParticipantAvatar({
  className,
  participant,
}: ParticipantAvatarProps) {
  const src = useUserAvatarUrl(participant.image)
  return (
    <Avatar className={cn("size-4", className)}>
      <AvatarImage alt="" src={src ?? ""} />
      <AvatarFallback className="text-[0.5rem]">
        {(participant.name ?? "").slice(0, 2)}
      </AvatarFallback>
    </Avatar>
  )
}
