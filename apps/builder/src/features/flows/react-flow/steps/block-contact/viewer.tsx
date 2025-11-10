"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const BlockContactStepViewer = () => {
  const t = useTranslations()
  return (
    <BaseStepViewer
      icon={UserRoundXIcon}
      title={t("flows.actions.blockContact")}
    />
  )
}

export default BlockContactStepViewer
