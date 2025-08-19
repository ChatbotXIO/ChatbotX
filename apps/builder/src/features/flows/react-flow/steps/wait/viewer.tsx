"use client"

import { DelayType, type WaitStepSchema } from "@aha.chat/flow-config"
import { T, useTranslate } from "@tolgee/react"
import { useParams } from "next/navigation"
import type { CustomFieldCollection } from "@/features/custom-fields/schemas"
import { callAPI } from "@/lib/swr"

type WaitStepViewerProps = {
  data: WaitStepSchema
}

export const WaitStepViewer = (props: WaitStepViewerProps) => {
  const { data } = props

  const { t } = useTranslate()
  const params = useParams<{ chatbotId: string }>()
  const url = `/api/chatbots/${params.chatbotId}/custom-fields?perPage=9999`
  const { data: dataCustomFields } = callAPI<CustomFieldCollection>(url)

  const customField = (dataCustomFields?.data ?? []).find(
    (obj) =>
      data.delayType === DelayType.DatetimeCustomField &&
      obj.id === data.customFieldId,
  )

  return (
    <div className="flex w-full items-center justify-center gap-2 break-all py-4 text-center">
      {data.delayType === DelayType.Duration && (
        <T
          keyName="flows.DelayType.Duration"
          params={{
            duration: data.duration,
            unit: t(`common.${data.unit}`),
          }}
        />
      )}
      {data.delayType === DelayType.SpecificDate && (
        <T
          keyName="flows.DelayType.SpecificDate"
          params={{ date: data.datetime }}
        />
      )}
      {data.delayType === DelayType.DatetimeCustomField && (
        <T
          keyName="flows.DelayType.DatetimeCustomField"
          params={{ customField: customField?.name ?? "" }}
        />
      )}
    </div>
  )
}
