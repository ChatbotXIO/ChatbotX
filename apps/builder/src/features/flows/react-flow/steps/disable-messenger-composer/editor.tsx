"use client"

import { KeyboardOffIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const DisableMessengerComposerStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={KeyboardOffIcon}
      title={t("flows.actions.disableMessengerComposer")}
    />
  )
}

export default DisableMessengerComposerStepEditor
