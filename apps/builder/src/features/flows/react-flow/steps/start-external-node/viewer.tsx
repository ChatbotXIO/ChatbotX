"use client"

import type { StartExternalNodeStepSchema } from "@aha.chat/flow-config"
import { ExternalLinkIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { useFlowSelectOptions } from "@/features/flows/provider/flow-hook"
import { BaseStepViewer } from "../base/viewer"

const StartExternalNodeStepViewer = ({
  data,
}: {
  data: StartExternalNodeStepSchema
}) => {
  const t = useTranslations()
  const flowOptions = useFlowSelectOptions()

  const targetFlow = useMemo(
    () => flowOptions.find((v) => v.value === data.flowId),
    [flowOptions, data.flowId],
  )

  return (
    <BaseStepViewer
      icon={ExternalLinkIcon}
      title={t("flows.actions.sendExternalFlow")}
    >
      {targetFlow && (
        <div className="flex flex-col">
          <div>Flow: {targetFlow.label}</div>
        </div>
      )}
    </BaseStepViewer>
  )
}

export default StartExternalNodeStepViewer
