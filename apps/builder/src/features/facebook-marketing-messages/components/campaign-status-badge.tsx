"use client"

import type { FacebookMarketingMessageStatus } from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { useTranslations } from "next-intl"
import { statusLabelKey } from "../lib/campaign-status"

const variantByStatus = {
  notSent: "outline",
  scheduled: "secondary",
  sending: "default",
  waitingNextDay: "secondary",
  paused: "outline",
  stopped: "outline",
  completed: "secondary",
  failed: "destructive",
} as const satisfies Record<
  FacebookMarketingMessageStatus,
  "default" | "secondary" | "destructive" | "outline"
>

export function CampaignStatusBadge({
  status,
}: {
  status: FacebookMarketingMessageStatus
}) {
  const t = useTranslations()
  return (
    <Badge variant={variantByStatus[status]}>{t(statusLabelKey[status])}</Badge>
  )
}
