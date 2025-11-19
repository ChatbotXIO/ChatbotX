"use client"

import { LinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const OpenWebsiteStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={LinkIcon} title={t("flows.actions.openWebsite")} />
  )
}

export default OpenWebsiteStepViewer
