"use client"

import { RefreshCwIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UpdateContactLifecycleStageStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={RefreshCwIcon}
      title={t("flows.actions.updateContactLifecycleStage")}
    />
  )
}

export default UpdateContactLifecycleStageStepViewer
