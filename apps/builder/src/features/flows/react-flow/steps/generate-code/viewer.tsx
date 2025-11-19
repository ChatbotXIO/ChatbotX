"use client"

import { ShuffleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const GenerateCodeStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={ShuffleIcon}
      title={t("flows.actions.generateCode")}
    />
  )
}

export default GenerateCodeStepViewer
