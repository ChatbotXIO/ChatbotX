"use client"

import {
  type WaitStepSchema,
  waitStepDateTypes,
  waitStepDelayTypes,
  waitStepOffsetOperators,
} from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useCustomFieldStore } from "@/features/custom-fields/provider/custom-field-store-context"

type WaitStepViewerProps = {
  data: WaitStepSchema
}

const WaitStepViewer = (props: WaitStepViewerProps) => {
  const { data } = props

  const t = useTranslations()
  const { customFields } = useCustomFieldStore((state) => state)

  const customField =
    data.delayType === waitStepDelayTypes.enum.date &&
    data.dateType === waitStepDateTypes.enum.dynamic
      ? customFields.find((obj) => obj.id === data.outputFieldId)
      : undefined

  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-0 text-center text-sm">
      <div>
        {t("flows.wait.delayTypeLabel")}{" "}
        <span className="rounded-full py-1 font-medium text-primary text-sm">
          {data.delayType === waitStepDelayTypes.enum.random
            ? t("flows.wait.randomized")
            : t("flows.wait.fixed")}
        </span>{" "}
        {t("flows.wait.delay")}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {data.delayType === waitStepDelayTypes.enum.duration && (
          <>
            {t("flows.wait.durationDetailPrefix")}{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.duration}
            </span>{" "}
            <span className="rounded-full py-1 font-medium text-primary text-sm">
              {data.unit}
            </span>
            <span className="text-muted-foreground">
              {data.interval
                ? `(${data.startTime?.slice(0, 5)} - ${data.endTime?.slice(0, 5)})`
                : ""}
            </span>
          </>
        )}
        {data.delayType === waitStepDelayTypes.enum.date &&
          data.dateType === waitStepDateTypes.enum.specific && (
            <>
              {t("flows.wait.dateDetailPrefix")}{" "}
              <span className="rounded-full py-1 font-medium text-primary text-sm">
                {data.datetime ? new Date(data.datetime).toLocaleString() : ""}
              </span>
            </>
          )}
        {data.delayType === waitStepDelayTypes.enum.date &&
          data.dateType === waitStepDateTypes.enum.dynamic && (
            <>
              {t("flows.wait.customFieldDetailPrefix")}{" "}
              <span className="rounded-full py-1 font-medium text-primary text-sm">
                {customField?.name ?? ""}
              </span>
              {data.offset && (
                <span className="text-muted-foreground">
                  (
                  {data.offsetOperator === waitStepOffsetOperators.enum.add
                    ? "+"
                    : "-"}
                  {data.offsetValue} {data.offsetUnit})
                </span>
              )}
            </>
          )}
        {data.delayType === waitStepDelayTypes.enum.random && (
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
