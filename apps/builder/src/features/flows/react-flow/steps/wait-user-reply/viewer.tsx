"use client"

import { ClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const WaitUserReplyStepViewer = () => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={ClockIcon} title={t("flows.actions.waitUserReply")} />
  )
}

export default WaitUserReplyStepViewer
