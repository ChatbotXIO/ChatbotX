"use client"

import { callAPI } from "@/lib/swr"
import { T, useTranslate } from "@tolgee/react"
import { useParams } from "next/navigation"
import { DelayType, type WaitStepSchema } from "./schema"
import type { CustomFieldCollection } from "@/features/fields/schemas/types"

export const WaitStepViewer = ({
  data,
  // id,
}: {
  data: WaitStepSchema
  // id: string
}) => {
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
    <div className="w-full flex items-center justify-center gap-2 py-4 text-center break-all">
      {data.delayType === DelayType.Duration && (
        <T
          keyName="flows.DelayType.Duration"
          params={{ duration: data.duration, unit: t(`common.${data.unit}`) }}
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
