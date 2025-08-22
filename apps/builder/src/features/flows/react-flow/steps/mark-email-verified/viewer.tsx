"use client"

import { CircleCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const MarkEmailVerifiedStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CircleCheckIcon}
      title={t("flows.stepType.markEmailVerified")}
    />
  )
}
