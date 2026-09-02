"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import {
  broadcastStatusConfig,
  parseBroadcastStatus,
} from "../lib/broadcast-status"

const BADGE_BASE_CLASS_NAME =
  "inline-flex h-[22px] w-fit items-center gap-1.5 whitespace-nowrap rounded-md px-2 font-medium text-xs"
const UNKNOWN_STATUS_BADGE_CLASS_NAME = "bg-muted text-muted-foreground"

export function BroadcastStatusBadge({ status }: { status: string }) {
  const t = useTranslations()
  const parsedStatus = parseBroadcastStatus(status)

  if (parsedStatus === null) {
    return (
      <span
        className={cn(BADGE_BASE_CLASS_NAME, UNKNOWN_STATUS_BADGE_CLASS_NAME)}
      >
        {status}
      </span>
    )
  }

  const config = broadcastStatusConfig[parsedStatus]

  return (
    <span className={cn(BADGE_BASE_CLASS_NAME, config.badgeClassName)}>
      <span
        aria-hidden="true"
        className={cn("size-[7px] shrink-0 rounded-full", config.dotClassName)}
      />
      {t(config.labelKey)}
    </span>
  )
}
