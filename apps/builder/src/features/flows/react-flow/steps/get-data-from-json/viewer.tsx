"use client"

import { CodeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export default function GetDataFromJsonViewer() {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CodeIcon}
      title={t("flows.stepType.getDataFromJson")}
    />
  )
}
