import { useFlowMutation } from "../flow-mutation-context"
import { DeleteNode } from "./delete-node"
import { DuplicateNode } from "./duplicate-node"
import { GetNodeId } from "./get-node-id"
import { SetStartNode } from "./set-start-node"

export function FlowNodeToolbar({
  isStartNode,
  nodeId,
}: {
  isStartNode: boolean
  nodeId: string
}) {
  const { isReadOnly } = useFlowMutation()
  return (
    <div className="flex justify-center gap-2 rounded-md border bg-white p-1 dark:bg-neutral-800">
      {isReadOnly ? null : <SetStartNode nodeId={nodeId} />}
      <GetNodeId nodeId={nodeId} />
      {isReadOnly ? null : <DuplicateNode nodeId={nodeId} />}
      {!(isReadOnly || isStartNode) && <DeleteNode nodeId={nodeId} />}
    </div>
  )
}
