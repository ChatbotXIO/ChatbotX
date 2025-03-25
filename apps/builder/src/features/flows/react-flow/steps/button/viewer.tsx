import { Button } from "@/components/ui/button"
import { Handle, Position } from "@xyflow/react"
import type { ButtonStepSchema } from "./schema"

export const ButtonStepViewer = ({ data }: { data: ButtonStepSchema }) => {
  return (
    <div className="relative">
      <Button type="button" variant="secondary" className="w-full" disabled>
        {data.label}
      </Button>
      <Handle
        id={data.id}
        type="source"
        position={Position.Right}
        className="right-3!"
      />
    </div>
  )
}

export const ButtonGroupViewer = ({ data }: { data: ButtonStepSchema[] }) => {
  return (
    <div className="flex flex-col gap-2 flex-1">
      {data.map((button) => (
        <ButtonStepViewer key={button.id} data={button} />
      ))}
    </div>
  )
}
