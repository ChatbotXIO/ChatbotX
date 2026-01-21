"use client"

import type { GetResponseStepSchema } from "@aha.chat/flow-config"
import { MailIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

export const GetResponseStepViewer = ({
  data: _data,
}: {
  data: GetResponseStepSchema
}) => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={MailIcon} title={t("flows.actions.getResponse")} />
  )
}

export default GetResponseStepViewer
