"use client"

import { TagIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const AddContactTagStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={TagIcon} title={t("flows.actions.addContactTag")} />
  )
}

export default AddContactTagStepViewer
