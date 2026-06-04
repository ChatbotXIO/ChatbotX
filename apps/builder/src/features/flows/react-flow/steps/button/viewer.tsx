import { type ButtonStepProps, buttonTypes } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"
import { useFlowAnalyticsStore } from "../../stores/flow-analytics-store-provider"

type ButtonStepViewerProps = {
  data: ButtonStepProps
}

export const ButtonStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props
  const { isAnalytics, buttonStats, totalSent } = useFlowAnalyticsStore()
  const clicks = buttonStats[data.id] ?? 0
  const clickPercent =
    totalSent > 0 ? Math.round((clicks / totalSent) * 100) : 0

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative min-w-0 flex-1">
        {isAnalytics && (
          <span className="absolute top-1/2 left-2 -translate-y-1/2 font-medium text-muted-foreground text-xs dark:text-white">
            {clickPercent}%
          </span>
        )}
        <Button
          className="w-full bg-zinc-300 dark:text-zinc-900"
          disabled
          type="button"
          variant="secondary"
        >
          {data.label}
        </Button>
        {(data.buttonType === buttonTypes.enum.sendMessage ||
          data.buttonType === buttonTypes.enum.performAction ||
          data.buttonType === buttonTypes.enum.startAnotherNode ||
          data.buttonType === null) && (
          <BaseHandle
            className={cn("right-3!", !!data.buttonType && "bg-red-300")}
            id={data.id}
            position={Position.Right}
            type="source"
          />
        )}
      </div>
    </div>
  )
}

type ButtonGroupViewerProps = {
  data: ButtonStepProps[]
}

export const ButtonGroupViewer = (props: ButtonGroupViewerProps) => {
  const { data } = props

  return (
    <div className="flex flex-1 flex-col gap-2 bg-gray-100 px-3 py-2 dark:bg-neutral-700">
      {data.map((button) => (
        <ButtonStepViewer data={button} key={button.id} />
      ))}
    </div>
  )
}

export const OnSuccessStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <div className="relative flex items-center justify-end gap-2 text-green-500 text-xs">
      <div className="mr-4">{t("actions.onSuccess")}</div>
      <BaseHandle
        className="transform-none! top-0.5! border-green-500!"
        id={data.id}
        onConnectedClassName="bg-green-500!"
        position={Position.Right}
        type="source"
      />
    </div>
  )
}

export const OnSkipStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <div className="relative flex items-center justify-end gap-2 text-xs text-yellow-500">
      <div className="mr-4">{t("actions.onSkip")}</div>
      <BaseHandle
        className="transform-none! top-0.5! border-yellow-500!"
        id={data.id}
        onConnectedClassName="bg-yellow-500!"
        position={Position.Right}
        type="source"
      />
    </div>
  )
}

export const OnFailureStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props
  const t = useTranslations()

  return (
    <div className="relative flex items-center justify-end gap-2 text-red-500 text-xs">
      <div className="mr-4">{t("actions.onFailure")}</div>
      <BaseHandle
        className="transform-none! top-0.5! border-red-500!"
        id={data.id}
        onConnectedClassName="bg-red-500!"
        position={Position.Right}
        type="source"
      />
    </div>
  )
}
