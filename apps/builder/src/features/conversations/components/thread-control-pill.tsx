"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  type ThreadControlView,
  useThreadControl,
  useThreadOwnerLabel,
} from "../hooks/use-thread-control"
import type { ListConversationItemResource } from "../schema/resource"
import { THREAD_CONTROL_TONES } from "./thread-control-tone"

/**
 * Conversation-row pill naming who answers the WhatsApp thread: the brand
 * while this app owns it, "Meta AI"/"Partner" while another responder does.
 * Nothing for an idle or never-routed thread. Reads only list payload fields.
 */
export function ThreadControlPill({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const threadControl = useThreadControl(conversation)
  if (!threadControl || threadControl.state === "idle") {
    return null
  }
  return <ThreadControlPillBadge threadControl={threadControl} />
}

function ThreadControlPillBadge({
  threadControl,
}: {
  threadControl: ThreadControlView
}) {
  const t = useTranslations()
  const ownerLabel = useThreadOwnerLabel()(
    threadControl.state,
    threadControl.ownerRole,
  )
  const tone = THREAD_CONTROL_TONES[threadControl.state]
  const Icon = tone.icon
  // A standby label may be long ("Partner · Customer service"): the pill shows
  // the short owner form and the tooltip the full owner.
  const shortOwner =
    threadControl.ownerRole === "ai_agent"
      ? ownerLabel
      : t("conversationRouting.owner.partner")
  // State-forward badge: "Standby (<owner>)" while a partner holds the thread,
  // "Active" while this app does. No brand name (white-label).
  const label =
    threadControl.state === "standby"
      ? t("conversationRouting.pill.standby", { owner: shortOwner })
      : t("conversationRouting.pill.owned")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex min-w-0">
            <Badge
              className={cn(
                "min-w-0 shrink gap-0.5 rounded px-1.5 py-0 font-medium text-[10px] leading-4",
                tone.className,
              )}
              variant="outline"
            >
              <Icon aria-hidden className="size-2.5 shrink-0" />
              <span className="truncate">{label}</span>
            </Badge>
          </span>
        }
      />
      <TooltipContent align="center" side="top">
        {t("conversationRouting.pill.tooltip", {
          owner: ownerLabel,
        })}
      </TooltipContent>
    </Tooltip>
  )
}
