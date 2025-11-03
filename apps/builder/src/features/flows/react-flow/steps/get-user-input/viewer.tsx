"use client"

import type { GetUserInputStepSchema } from "@aha.chat/flow-config"
import { ClockIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BaseStepViewer } from "../base/viewer"

const GetUserInputStepViewer = ({ data }: { data: GetUserInputStepSchema }) => {
  const t = useTranslations()

  return (
    <BaseStepViewer icon={ClockIcon} title={t("flows.actions.getUserInput")}>
      <p>{data.message}</p>
    </BaseStepViewer>
  )
}

export default GetUserInputStepViewer
