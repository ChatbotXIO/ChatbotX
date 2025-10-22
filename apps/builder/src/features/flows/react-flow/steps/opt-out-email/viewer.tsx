"use client"

import { BellOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const OptOutEmailStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={BellOffIcon} title={t("flows.actions.optOutEmail")} />
  )
}

export default OptOutEmailStepViewer
