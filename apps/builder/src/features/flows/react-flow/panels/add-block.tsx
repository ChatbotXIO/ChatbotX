import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { T } from "@tolgee/react"
import { ControlButton, useReactFlow } from "@xyflow/react"
import { Plus } from "lucide-react"
import { useState } from "react"
import type { NodeType } from "../types"
// import { useFlowStore } from "../stores/flow-store-provider"
import { DynamicIcon } from "lucide-react/dynamic"
import { allNodesConfig } from "../nodes/node-config"
import { useFlowStore } from "../stores/flow-store-provider"

export function AddBlockButton() {
  const [open, setOpen] = useState(false)

  const addNode = useFlowStore((state) => state.addNode)
  const { screenToFlowPosition } = useReactFlow()

  // const nodes = useStore((state) => state.nodes)
  // const setNodes = useStore((state) => state.setNodes)

  // const { onAddNode } = useFlowStore(state => state)
  const onClickAction = (nodeType: NodeType) => {
    addNode(
      nodeType,
      {
        position: screenToFlowPosition({
          x: window.innerWidth - 400,
          y: 50,
        }),
      }
    )
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
          {allNodesConfig.map((item) => {
            return (
              <Button
                key={item.type}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => onClickAction(item.type)}
              >
                <DynamicIcon name={item.icon} />
                <T keyName={item.label} />
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
