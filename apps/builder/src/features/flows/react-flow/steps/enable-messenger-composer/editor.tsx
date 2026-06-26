"use client"

import { KeyboardIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const EnableMessengerComposerStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={KeyboardIcon}
      title={t("flows.actions.enableMessengerComposer")}
    />
  )
}

export default EnableMessengerComposerStepEditor
