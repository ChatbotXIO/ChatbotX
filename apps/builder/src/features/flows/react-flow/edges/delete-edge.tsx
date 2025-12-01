import { Button } from "@aha.chat/ui/components/ui/button"
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
} from "@xyflow/react"
import { TrashIcon } from "lucide-react"
import { memo } from "react"

export default memo((props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    data,
    deletable,
    selectable,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    targetHandleId,
    pathOptions,
    ...rest
  } = props

  const onDelete = () => {
    const handler = (data as { onDelete?: (edgeId: string) => void }).onDelete
    if (handler) {
      handler(id)
    }
  }

  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY })

  const midX = (sourceX + targetX) / 2
  const midY = (sourceY + targetY) / 2

  return (
    <>
      <BaseEdge {...rest} path={path} />
      <EdgeLabelRenderer>
        <Button
          aria-label="Delete edge"
          className="-translate-x-1/2 -translate-y-1/2 pointer-events-auto absolute z-10 cursor-pointer rounded bg-white px-2 py-1 text-xs shadow hover:bg-red-100"
          onClick={onDelete}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onDelete()
            }
          }}
          style={{ left: midX, top: midY }}
          type="button"
          variant="ghost"
        >
          <TrashIcon />
        </Button>
      </EdgeLabelRenderer>
    </>
  )
})
