"use client"

import { CodeIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const GetDataFromJsonViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CodeIcon}
      title={t("flows.actions.getDataFromJson")}
    />
  )
}

export default GetDataFromJsonViewer
