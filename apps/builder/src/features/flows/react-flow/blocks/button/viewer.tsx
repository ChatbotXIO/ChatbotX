import { BaseHandle } from "@/components/base-handle"
import { Button } from "@/components/ui/button"
import { Position } from "@xyflow/react"
import type { ButtonBlockSchema } from "./schema"

export const ButtonBlockViewer = ({ data }: { data: ButtonBlockSchema }) => {
  return (
    <div className="relative">
      <Button type="button" variant="secondary" className="w-full" disabled>
        {data.label}
      </Button>
      <BaseHandle
        id={data.id}
        type="source"
        position={Position.Right}
        className="!right-3"
      />
    </div>
  )
}

export const ButtonGroupViewer = ({ data }: { data: ButtonBlockSchema[] }) => {
  return (
    <div className="flex flex-col gap-2 flex-1">
      {data.map((button) => (
        <ButtonBlockViewer key={button.id} data={button} />
      ))}
    </div>
  )
}
