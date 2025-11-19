"use client"

import { RssIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const SubscribeBroadcastStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor
      icon={RssIcon}
      title={t("flows.actions.subscribeBroadcast")}
    />
  )
}

export default SubscribeBroadcastStepEditor
