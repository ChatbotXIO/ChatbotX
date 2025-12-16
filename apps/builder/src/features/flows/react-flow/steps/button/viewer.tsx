import type { ButtonStepProps } from "@aha.chat/flow-config"
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
      <Button className="w-full" disabled type="button" variant="secondary">
        {data.label}
      </Button>
      <BaseHandle
        className={cn("right-3!", !!data.buttonType && "bg-red-300")}
        id={data.id}
        position={Position.Right}
        type="source"
      />
    </div>
  )
}

type ButtonGroupViewerProps = {
  data: ButtonStepProps[]
}

export const ButtonGroupViewer = (props: ButtonGroupViewerProps) => {
  const { data } = props

  return (
    <div className="flex flex-1 flex-col gap-2">
      {data.map((button) => (
        <ButtonStepViewer data={button} key={button.id} />
      ))}
    </div>
  )
}
