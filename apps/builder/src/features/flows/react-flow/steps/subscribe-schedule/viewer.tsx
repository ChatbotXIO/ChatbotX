"use client"

import { Layers2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const SubscribeSequenceStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={Layers2Icon}
      title={t("flows.actions.subscribeSequence")}
    />
  )
}

export default SubscribeSequenceStepViewer
