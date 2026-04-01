"use client"

import type { StartExternalFlowStepSchema } from "@chatbotx.io/flow-config"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { BaseStepViewer } from "../base/viewer"

const SendExternalFlowStepViewer = ({
  data,
}: {
  data: StartExternalFlowStepSchema
}) => {
  const t = useTranslations()

  const flowOptions = useFlowSelectOptions()
  const targetFlow = flowOptions.find((v) => v.value === data.flowId)

  return (
    <BaseStepViewer
      icon={ExternalLinkIcon}
      title={t("flows.actions.sendExternalFlow")}
    >
      <div className="flex flex-col">
        {targetFlow && <div>{targetFlow.label}</div>}
      </div>
    </BaseStepViewer>
  )
}

export default SendExternalFlowStepViewer
