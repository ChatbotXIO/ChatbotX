"use client"

import { RssIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const UnsubscribeBroadcastStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={RssIcon}
      title={t("flows.actions.unsubscribeBroadcast")}
    />
  )
}

export default UnsubscribeBroadcastStepEditor
