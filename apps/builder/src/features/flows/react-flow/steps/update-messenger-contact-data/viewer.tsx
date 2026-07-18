"use client"

import { CloudDownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const UpdateMessengerContactDataStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CloudDownloadIcon}
      title={t("flows.actions.updateMessengerContactData")}
    />
  )
}

export default UpdateMessengerContactDataStepViewer
