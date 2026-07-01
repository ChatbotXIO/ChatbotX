"use client"

import { KeyboardIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const EnableMessengerComposerStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer
      icon={KeyboardIcon}
      title={t("flows.actions.enableMessengerComposer")}
    />
  )
}

export default EnableMessengerComposerStepViewer
