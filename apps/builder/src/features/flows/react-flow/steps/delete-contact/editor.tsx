"use client"

import { UserRoundXIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const DeleteContactStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={UserRoundXIcon}
      title={t("flows.actions.deleteContact")}
    />
  )
}

export default DeleteContactStepEditor
