import { DeleteNode } from "./delete-node"
import { DuplicateNode } from "./duplicate-node"
import { GetNodeId } from "./get-node-id"
import { SetStartNode } from "./set-start-node"

export function FlowNodeToolbar({ isStartNode }: { isStartNode: boolean }) {
  return (
    <div className="flex justify-center gap-2 rounded-md border bg-white p-1 dark:bg-neutral-800">
      {/*
        StartNode (= TriggerNode) é único, não-duplicável e não-deletável.
        Mantém apenas GetNodeId pra inspeção/debug.
      */}
      {!isStartNode && <SetStartNode />}
      <GetNodeId />
      {!isStartNode && <DuplicateNode />}
      {!isStartNode && <DeleteNode />}
    </div>
  )
}
