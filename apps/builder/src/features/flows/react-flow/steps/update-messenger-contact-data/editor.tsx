"use client"

import { CloudDownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const UpdateMessengerContactDataStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={CloudDownloadIcon}
      title={t("flows.actions.updateMessengerContactData")}
    />
  )
}

export default UpdateMessengerContactDataStepEditor
