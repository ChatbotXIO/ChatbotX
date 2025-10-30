"use client"

import { ClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepEditor } from "../base/editor"

const WaitUserReplyStepEditor = () => {
  const t = useTranslations()

  return (
    <BaseStepEditor icon={ClockIcon} title={t("flows.actions.waitUserReply")} />
  )
}

export default WaitUserReplyStepEditor
