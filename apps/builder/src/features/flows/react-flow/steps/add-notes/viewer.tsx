"use client"

import { MessageCircleMore } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const AddNotesStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MessageCircleMore}
      title={t("flows.actions.addContactNotes")}
    />
  )
}

export default AddNotesStepViewer
