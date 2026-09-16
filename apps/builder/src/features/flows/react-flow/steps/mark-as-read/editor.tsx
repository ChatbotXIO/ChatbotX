"use client"

import { useTranslations } from "next-intl"

export default function MarkAsReadStepEditor() {
  const t = useTranslations()

  return (
    <div className="text-muted-foreground text-sm">
      {t("flows.fields.markAsReadDescription")}
    </div>
  )
}
