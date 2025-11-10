"use client"

import { CircleCheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const MarkEmailVerifiedStepEditor = () => {
  const t = useTranslations()
  return (
    <BaseStepEditor
      icon={CircleCheckIcon}
      title={t("flows.actions.markEmailVerified")}
    />
  )
}

export default MarkEmailVerifiedStepEditor
