"use client"

import { OctagonXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const RemoveContactTagStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={OctagonXIcon}
      title={t("flows.actions.removeContactTag")}
    />
  )
}

export default RemoveContactTagStepViewer
