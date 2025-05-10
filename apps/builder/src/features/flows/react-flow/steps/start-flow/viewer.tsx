"use client"

import { callAPI } from "@/lib/swr"
import type { Flow } from "@ahachat.ai/database/types"
import { T, useTranslate } from "@tolgee/react"
import { useParams } from "next/navigation"
import type { StartFlowStepSchema } from "./schema"
import type { FlowCollection } from "@/features/flows/schemas/get-flows-schema"

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
  const flow = ((flowData?.data ?? []) as Flow[]).find(
    (obj) => obj.id === data.flowId,
  )

  return (
    <div className="w-full p-2 text-center break-all border-dashed border rounded">
      <div className="font-bold">
        <T keyName="flows.sendFlow" />
      </div>
      {flow && <div>{flow.name}</div>}
      {!flow && <div>{t("flows.clickToSelectFlow")}</div>}
    </div>
  )
}
