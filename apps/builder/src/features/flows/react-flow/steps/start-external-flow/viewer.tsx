"use client"

import type { StartExternalFlowStepSchema } from "@aha.chat/flow-config"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useStepStore } from "../../stores/step-store-provider"
import { BaseStepViewer } from "../base/viewer"

const SendExternalFlowStepViewer = ({
  data,
}: {
  data: StartExternalFlowStepSchema
}) => {
  const t = useTranslations()

  const { flowOptions } = useStepStore((state) => state)
  const flow = flowOptions.find((fl) => fl.value === data.flowId)

  return (
    <BaseStepViewer
      icon={ExternalLinkIcon}
      title={t("flows.actions.sendExternalFlow")}
    >
      <div className="flex flex-col">{flow && <div>{flow.label}</div>}</div>
    </BaseStepViewer>
  )
}

export default SendExternalFlowStepViewer
