"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const BlockContactStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserRoundXIcon}
      title={t("flows.actions.blockContact")}
    />
  )
}

export default BlockContactStepEditor
