import type { NodeType } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import { createId } from "@paralleldrive/cuid2"
import {
  ControlButton,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react"
import { Plus } from "lucide-react"
import { useState } from "react"
import { allNodesConfig } from "./node-config"

export function AddNodeButton() {
  const [open, setOpen] = useState(false)
  const reactFlow = useReactFlow()

  const onClickAction = (nodeType: NodeType) => {
    addNewNode(reactFlow, nodeType)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <ControlButton>
          <Plus />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col items-start">
          {Object.values(allNodesConfig).map((item) =>
            item ? (
              <Button
                className="w-full justify-start"
                key={item.type}
                onClick={() => onClickAction(item.type)}
                variant="ghost"
              >
                <item.icon />
                {item.label}
              </Button>
            ) : null,
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function addNewNode(
  reactFlow: ReactFlowInstance,
  nodeType: NodeType,
): string | null {
  const { screenToFlowPosition, addNodes, getNodes } = reactFlow

  const allNodes = getNodes()

  let labelVersion = 1
  for (const node of allNodes) {
    if (node.type === nodeType) {
      labelVersion++
    }
  }

  const newNodeId = createId()
  const targetNodeConfig = allNodesConfig[nodeType]
  const newNode = targetNodeConfig?.defaultFn?.({
    id: newNodeId,
    labelVersion,
    position: screenToFlowPosition({
      x: window.innerWidth - 400,
      y: 50,
    }),
  })
  if (newNode) {
    addNodes([newNode])
  }

  return null
}
