"use client"

import { SaveIcon } from "lucide-react"
import { useTranslations } from "next-intl"

const SetCustomFieldStepViewer = () => {
  const t = useTranslations()

  return (
    <div className="flex w-full items-center gap-2 py-4 text-center font-medium text-sm">
      <SaveIcon className="text-yellow-500" size={18} />
      {t("flows.actions.setCustomField")}
    </div>
  )
}

export default SetCustomFieldStepViewer
