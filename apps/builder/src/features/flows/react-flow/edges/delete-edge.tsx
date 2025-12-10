import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react"
import { XIcon } from "lucide-react"
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
  const { deleteElements } = useReactFlow()

  const onDelete = async () => {
    await deleteElements({
      edges: [
        {
          id,
        },
      ],
    })
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <BaseEdge {...rest} path={edgePath} />
      <EdgeLabelRenderer>
        <Button
          aria-label="Delete edge"
          className={cn(
            "nodrag nopan pointer-events-auto absolute hidden hover:bg-color-none",
            (data as { isHovered?: boolean })?.isHovered && "inline-flex",
          )}
          onClick={onDelete}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              onDelete()
            }
          }}
          size="sm"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
          type="button"
          variant="destructive"
        >
          <XIcon />
        </Button>
      </EdgeLabelRenderer>
    </>
  )
})
