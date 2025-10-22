"use client"

import { BellRingIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const OptInEmailStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={BellRingIcon} title={t("flows.actions.optInEmail")} />
  )
}

export default OptInEmailStepViewer
