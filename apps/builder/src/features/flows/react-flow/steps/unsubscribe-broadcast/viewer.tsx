"use client"

import { PackageOpenIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UnsubscribeBroadcastStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={PackageOpenIcon}
      title={t("flows.actions.unarchiveConversation")}
    />
  )
}

export default UnsubscribeBroadcastStepViewer
