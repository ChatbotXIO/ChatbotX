"use client"

import { BellOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const OptOutEmailStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={BellOffIcon}
      title={t("flows.stepType.optOutEmail")}
    />
  )
}

export { OptOutEmailStepEditor }
