"use client"

import { CheckCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"

export default function MarkAsReadStepViewer() {
  const t = useTranslations()

  return (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <CheckCheckIcon className="size-4 text-blue-500" />
      <span>{t("flows.actions.markAsRead")}</span>
    </div>
  )
}
