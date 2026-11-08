"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useLockedIdSet } from "./lock-context"

export function LockBadge({ resourceId }: { resourceId: string }) {
  const t = useTranslations("templates.locked")
  const lockedIds = useLockedIdSet()
  if (!lockedIds?.has(resourceId)) {
    return null
  }
  return (
    <Badge
      className="ms-2 shrink-0 gap-1"
      title={t("badgeHint")}
      variant="outline"
    >
      <LockIcon aria-hidden="true" className="size-3" />
      {t("badge")}
      <span className="sr-only">{t("badgeHint")}</span>
    </Badge>
  )
}
