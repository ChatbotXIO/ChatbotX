"use client"

import { KeyboardOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const DisableMessengerComposerStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={KeyboardOffIcon}
      title={t("flows.actions.disableMessengerComposer")}
    />
  )
}

export default DisableMessengerComposerStepViewer
