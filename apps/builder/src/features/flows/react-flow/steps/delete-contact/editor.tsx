"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

export const DeleteContactStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserRoundXIcon}
      title={t("flows.stepType.deleteContact")}
    />
  )
}
