import { type ButtonStepProps, ButtonType } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import { Position } from "@xyflow/react"
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
