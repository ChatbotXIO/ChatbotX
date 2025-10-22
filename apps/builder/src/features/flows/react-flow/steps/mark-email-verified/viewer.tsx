"use client"

import { CircleCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const MarkEmailVerifiedStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={CircleCheckIcon}
      title={t("flows.actions.markEmailVerified")}
    />
  )
}

export default MarkEmailVerifiedStepViewer
