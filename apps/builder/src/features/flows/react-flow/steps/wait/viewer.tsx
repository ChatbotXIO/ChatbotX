"use client"

import { DelayType, type WaitStepSchema } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import type { ListCustomFieldsResponse } from "@/features/custom-fields/schemas/query"
import { useWorkspaceId } from "@/hooks/routing"
import { callAPI } from "@/lib/swr"

type WaitStepViewerProps = {
  data: WaitStepSchema
}

const WaitStepViewer = (props: WaitStepViewerProps) => {
  const { data } = props

  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const url = `/api/workspaces/${workspaceId}/custom-fields?perPage=9999`
  const { data: dataCustomFields } = callAPI<ListCustomFieldsResponse>(url)

  const customField = (dataCustomFields?.data ?? []).find(
    (obj) =>
      data.delayType === DelayType.customField && obj.id === data.outputFieldId,
  )

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-0 text-center text-sm">
      <div>
        {t("flows.wait.delayTypeLabel")}{" "}
        <span className="rounded-full py-1 font-medium text-primary text-sm">
          {data.delayType === DelayType.random
            ? t("flows.wait.randomized")
            : t("flows.wait.fixed")}
        </span>{" "}
        {t("flows.wait.delay")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {data.delayType === DelayType.duration && (
          <>
            {t("flows.wait.durationDetailPrefix")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.duration}
            </span>{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.unit}
            </span>
          </>
        )}
        {data.delayType === DelayType.specify && (
          <>
            {t("flows.wait.specifyDetailPrefix")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.datetime ? new Date(data.datetime).toLocaleString() : ""}
            </span>
          </>
        )}
        {data.delayType === DelayType.customField && (
          <>
            {t("flows.wait.customFieldDetailPrefix")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {customField?.name ?? ""}
            </span>
          </>
        )}
        {data.delayType === DelayType.random && (
          <>
            {t("flows.wait.randomDetailPrefix")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.min}
            </span>{" "}
            {t("flows.wait.randomDetailAnd")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.max}
            </span>{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.unit}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default WaitStepViewer
