"use client"

import { DelayType, type WaitStepSchema } from "@aha.chat/flow-config"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import type { ListCustomFieldsResponse } from "@/features/custom-fields/schemas/query"
import { callAPI } from "@/lib/swr"

type WaitStepViewerProps = {
  data: WaitStepSchema
}

const WaitStepViewer = (props: WaitStepViewerProps) => {
  const { data } = props

  const t = useTranslations()
  const params = useParams<{ chatbotId: string }>()
  const url = `/api/chatbots/${params.chatbotId}/custom-fields?perPage=9999`
  const { data: dataCustomFields } = callAPI<ListCustomFieldsResponse>(url)

  const customField = (dataCustomFields?.data ?? []).find(
    (obj) =>
      data.delayType === DelayType.customField && obj.id === data.outputCfId,
  )

  return (
    <div className="break-word flex w-full items-center justify-center gap-2 py-4 text-center">
      {data.delayType === DelayType.duration &&
        t("flows.delayType.durationValue", {
          duration: data.duration,
        })}
      {data.delayType === DelayType.specify &&
        t("flows.delayType.specificDateValue", {
          date: data.datetime,
        })}
      {data.delayType === DelayType.customField &&
        t("flows.delayType.datetimeCustomFieldValue", {
          customField: customField?.name ?? "",
        })}
    </div>
  )
}

export default WaitStepViewer
