import { Button } from "@aha.chat/ui/components/ui/button"
import { cn } from "@aha.chat/ui/lib/utils"
import {
  BaseEdge,
  EdgeLabelRenderer,
  type EdgeProps,
  EdgeToolbar,
  getBezierPath,
  useReactFlow,
} from "@xyflow/react"
import { Trash2Icon } from "lucide-react"
import { memo } from "react"

export default memo((props: EdgeProps) => {
  const { deleteElements } = useReactFlow()

  const onDelete = () => {
    deleteElements({
      edges: [
        {
          id: props.id,
        },
      ],
    })
  }

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

  const [edgePath, centerX, centerY] = getBezierPath(props)

  return (
    <>
      <BaseEdge path={edgePath} {...rest} />

      <EdgeLabelRenderer>
        <EdgeToolbar
          edgeId={props.id}
          isVisible={!!props.data?.isHovered}
          x={centerX}
          y={centerY}
        >
          <Button
            aria-label="Delete edge"
            className={cn(
              "nodrag nopan pointer-events-auto cursor-pointer rounded-full px-1.5! font-bold text-destructive hover:bg-color-none hover:text-destructive",
              props.data && "inline-flex",
            )}
            onClick={onDelete}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                onDelete()
              }
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Trash2Icon className="size-5" />
          </Button>
        </EdgeToolbar>
      </EdgeLabelRenderer>
    </>
  )
})
