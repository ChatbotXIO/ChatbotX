"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const DeleteContactStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={UserRoundXIcon}
      title={t("flows.actions.deleteContact")}
    />
  )
}

export default DeleteContactStepViewer
