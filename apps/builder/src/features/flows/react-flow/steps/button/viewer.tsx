import { type ButtonStepProps, ButtonType } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { BaseHandle } from "@/components/base-handle"

type ButtonStepViewerProps = {
  data: ButtonStepProps
}

export const ButtonStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props

  return (
    <div className="relative">
      <Button
        className="w-full bg-zinc-300 dark:text-zinc-900"
        disabled
        type="button"
        variant="secondary"
      >
        {data.label}
      </Button>
      {(data.buttonType === ButtonType.SendMessage ||
        data.buttonType === ButtonType.PerformAction ||
        data.buttonType === ButtonType.StartAnotherNode ||
        data.buttonType === null) && (
        <BaseHandle
          className={cn("right-3!", !!data.buttonType && "bg-red-300")}
          id={data.id}
          position={Position.Right}
          type="source"
        />
      )}
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
