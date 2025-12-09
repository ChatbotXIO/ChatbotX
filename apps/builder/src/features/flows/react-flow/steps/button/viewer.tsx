import type { ButtonStepProps } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Handle, Position, useReactFlow } from "@xyflow/react"
import { useNodeData } from "../../libs/use-node-data"

type ButtonStepViewerProps = {
  data: ButtonStepProps
}

export const ButtonStepViewer = (props: ButtonStepViewerProps) => {
  const { data } = props
  const { updateNodeDataOnEdgeConnect } = useNodeData()
  const { getEdges } = useReactFlow()
  const isConnected = getEdges().some((edge) => edge.sourceHandle === data.id)

  return (
    <div className="relative">
      <Button className="w-full" disabled type="button" variant="secondary">
        {data.label}
      </Button>
      <Handle
        className="right-3!"
        id={data.id}
        isConnectable={!isConnected}
        onConnect={updateNodeDataOnEdgeConnect}
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
