"use client"

import { SheetIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export default function SpreadsheetClearRowViewer() {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={SheetIcon}
      title={t("flows.StepType.SpreadsheetClearRow")}
    />
  )
}
