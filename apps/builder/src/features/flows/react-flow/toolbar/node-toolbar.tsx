import { DeleteNode } from "./delete-node"
import { DuplicateNode } from "./duplicate-node"
import { GetNodeId } from "./get-node-id"
import { SetStartNode } from "./set-start-node"

export function FlowNodeToolbar() {
  return (
    <div className="flex justify-center gap-2 rounded-md border bg-white p-1">
      <SetStartNode />
      <GetNodeId />
      <DuplicateNode />
      <DeleteNode />
    </div>
  )
}
