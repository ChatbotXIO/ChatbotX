"use client"

import { TagIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const addContactTagStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={TagIcon} title={t("flows.stepType.addContactTag")} />
  )
}
