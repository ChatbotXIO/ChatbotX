"use client"

import type { FlowModel } from "@aha.chat/database/types"
import type { StartFlowStepSchema } from "@aha.chat/flow-config"
import { T, useTranslate } from "@tolgee/react"
import { ExternalLinkIcon } from "lucide-react"
import { useParams } from "next/navigation"
import type { FlowCollection } from "@/features/flows/schemas/get-flows-schema"
import { callAPI } from "@/lib/swr"
import { BaseStepViewer } from "../base/viewer"

export const StartFlowStepViewer = ({
  data,
  // id,
}: {
  data: StartFlowStepSchema
  // id: string
}) => {
  const { t } = useTranslate()
  const params = useParams<{ chatbotId: string }>()

  const url = `/api/chatbots/${params.chatbotId}/flows?perPage=9999`
  const { data: flowData } = callAPI<FlowCollection>(url)
  const flow = ((flowData?.data ?? []) as FlowModel[]).find(
    (obj) => obj.id === data.flowId,
  )

  return (
    <BaseStepViewer
      icon={ExternalLinkIcon}
      title={<T keyName="flows.StepType.sendFlow" />}
    >
      <div className="flex flex-col">
        {flow && <div>{flow.name}</div>}
        {!flow && <div>{t("flows.clickToSelectFlow")}</div>}
      </div>
    </BaseStepViewer>
  )
}
