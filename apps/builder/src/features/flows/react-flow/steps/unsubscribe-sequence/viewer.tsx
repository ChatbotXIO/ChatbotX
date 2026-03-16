"use client"

import { Layers2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UnsubscribeSequenceStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={Layers2Icon}
      title={t("flows.actions.unsubscribeSequence")}
    />
  )
}

export default UnsubscribeSequenceStepViewer
