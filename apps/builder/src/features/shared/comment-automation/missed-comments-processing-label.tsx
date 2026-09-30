"use client"

import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

/** Shown under an automation's name while it processes missed comments. */
export function MissedCommentsProcessingLabel() {
  const t = useTranslations()
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      <Loader2Icon className="size-3 animate-spin" />
      {t("commentAutomationMissedComments.processing")}
    </span>
  )
}
