"use client"

import type { Field } from "@ahachat.ai/database"
import { T, useTranslate } from "@tolgee/react"
import { useMemo } from "react"
import { DelayType, type WaitBlockSchema } from "./schema"

export const WaitBlockViewer = ({
  customFields,
  data,
  id,
}: {
  customFields: Field[]
  data: WaitBlockSchema
  id: string
}) => {
  const { t } = useTranslate()
  const customFieldLabel = useMemo(() => {
    const customField = customFields.find(
      (obj) =>
        data.delayType === DelayType.DatetimeCustomField &&
        obj.id === data.customFieldId,
    )
    if (customField) {
      return customField.name
    }

    return ""
  }, [data, customFields])

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
          params={{ customField: customFieldLabel }}
        />
      )}
    </div>
  )
}
