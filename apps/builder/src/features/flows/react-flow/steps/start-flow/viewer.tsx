"use client"

import { callAPI } from "@/lib/swr"
import type { FlowModel } from "@ahachat.ai/database/types"
import { T, useTranslate } from "@tolgee/react"
import { useParams } from "next/navigation"
import type { StartFlowStepSchema } from "@ahachat.ai/flow-config"
import type { FlowCollection } from "@/features/flows/schemas/get-flows-schema"
import { BaseStepViewer } from "../base/viewer"
import { ExternalLinkIcon } from "lucide-react"

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
