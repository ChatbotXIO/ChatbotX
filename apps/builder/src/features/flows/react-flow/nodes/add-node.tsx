import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { createId } from "@paralleldrive/cuid2"
import { T } from "@tolgee/react"
import {
  ControlButton,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react"
import { Plus } from "lucide-react"
import { useState } from "react"
import { allNodesConfig } from "./node-config"
import type { NodeType } from "../types"

export function AddNodeButton() {
  const [open, setOpen] = useState(false)
  const reactFlow = useReactFlow()

  const onClickAction = (nodeType: NodeType) => {
    addNewNode(reactFlow, nodeType)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ControlButton>
          <Plus />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent>
        <div className="flex flex-col items-start">
          {Object.values(allNodesConfig).map((item) => {
            return item ? (
              <Button
                key={item.type}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => onClickAction(item.type)}
              >
                <item.icon />
                <T keyName={item.label} />
              </Button>
            ) : null
          })}
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
