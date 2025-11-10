"use client"

import { RssIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const SubscribeBroadcastStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={RssIcon}
      title={t("flows.actions.subscribeBroadcast")}
    />
  )
}

export default SubscribeBroadcastStepViewer
