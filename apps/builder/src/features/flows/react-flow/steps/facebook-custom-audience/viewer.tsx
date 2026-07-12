"use client"

import { MegaphoneIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const FacebookCustomAudienceViewer = () => {
  const t = useTranslations()
  return (
    <BaseStepViewer
      icon={MegaphoneIcon}
      title={t("flows.actions.facebookCustomAudience")}
    />
  )
}

export default FacebookCustomAudienceViewer
