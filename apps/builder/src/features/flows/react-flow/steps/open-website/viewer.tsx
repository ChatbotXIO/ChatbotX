"use client"

import { LinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const OpenWebsiteStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={LinkIcon} title={t("flows.stepType.openWebsite")} />
  )
}
