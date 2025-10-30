"use client"

import { BellRingIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const OptInEmailStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={BellRingIcon} title={t("flows.actions.optInEmail")} />
  )
}

export default OptInEmailStepEditor
