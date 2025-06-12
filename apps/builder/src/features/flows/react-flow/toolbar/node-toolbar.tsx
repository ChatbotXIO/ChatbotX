import { GetNodeId } from "./get-node-id"
import { DuplicateNode } from "./duplicate-node"
import { DeleteNode } from "./delete-node"
import { SetStartNode } from "./set-start-node"

export function FlowNodeToolbar() {
  return (
    <div className="flex gap-2 justify-center bg-white border rounded-md p-1">
      <SetStartNode />
      <GetNodeId />
      <DuplicateNode />
      <DeleteNode />
    </div>
  )
}
