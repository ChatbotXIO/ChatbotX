"use client"

import { MenuIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const SetMessengerUserPersistentMenuStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={MenuIcon}
      title={t("flows.actions.setMessengerUserPersistentMenu")}
    />
  )
}

export default SetMessengerUserPersistentMenuStepViewer
