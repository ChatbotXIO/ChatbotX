"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useFormatter, useTranslations } from "next-intl"
import type { ConversationParticipantResource } from "../schema/resource"
import { ParticipantAvatar } from "./participant-avatar"

type ConversationParticipantStackProps = {
  participants: readonly ConversationParticipantResource[]
}

/**
 * Overlapping avatars of the members who replied, on an inbox row. Renders
 * nothing when nobody replied, so an untouched conversation looks as before.
 */
export function ConversationParticipantStack({
  participants,
}: ConversationParticipantStackProps) {
  const t = useTranslations("conversationParticipants")
  const format = useFormatter()
  if (participants.length === 0) {
    return null
  }
  const names = participants.map(
    (participant) => participant.name ?? t("unnamedMember"),
  )
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={t("joined", {
              names: format.list(names, { type: "unit", style: "long" }),
            })}
            className="flex shrink-0 items-center -space-x-1"
            role="img"
          >
            {participants.map((participant) => (
              <ParticipantAvatar
                className="ring-1 ring-background"
                key={participant.userId}
                participant={participant}
              />
            ))}
          </span>
        }
      />
      <TooltipContent align="center" side="bottom">
        {t("joined", {
          names: format.list(names, { type: "unit", style: "long" }),
        })}
      </TooltipContent>
    </Tooltip>
  )
}
