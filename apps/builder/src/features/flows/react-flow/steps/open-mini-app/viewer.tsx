"use client"

import { AppWindowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const OpenMiniAppStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={AppWindowIcon}
      title={t("flows.actions.openMiniApp")}
    />
  )
}

export default OpenMiniAppStepViewer
