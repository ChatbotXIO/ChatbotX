import type { NodeType } from "@aha.chat/flow-config"
import { Button } from "@aha.chat/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@aha.chat/ui/components/ui/popover"
import {
  ControlButton,
  type ReactFlowInstance,
  useReactFlow,
} from "@xyflow/react"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { allNodesConfig } from "../nodes/node-config"
import type { TranslationFn } from "../nodes/types"

export default function AddNodeButton() {
  const [open, setOpen] = useState(false)
  const t = useTranslations()
  const reactFlow = useReactFlow()

  const onClickAction = (nodeType: NodeType) => {
    addNewNode(reactFlow, nodeType, t)
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <ControlButton className="h-9! w-14! bg-primary! p-0! text-primary-foreground!">
          <PlusIcon className="max-h-full! max-w-full! fill-none!" />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-2">
        <div className="flex flex-col items-start">
          {Object.values(allNodesConfig).map((it, idx) => {
            const item = it?.(t)
            return item ? (
              <Button
                className="w-full justify-start"
                key={item.type}
                onClick={() => onClickAction(item.type)}
                variant="ghost"
              >
                <item.icon />
                {item.label}
              </Button>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: safe return
              <div key={idx} />
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function addNewNode(
  reactFlow: ReactFlowInstance,
  nodeType: NodeType,
  t: TranslationFn,
): string | null {
  const { screenToFlowPosition, addNodes, getNodes } = reactFlow

  const allNodes = getNodes()

  let labelVersion = 1
  for (const node of allNodes) {
    if (node.type === nodeType) {
      labelVersion += 1
    }
  }

  const targetNodeConfig = allNodesConfig[nodeType]?.(t)
  if (!targetNodeConfig) {
    return null
  }
  const newNode = targetNodeConfig.defaultFn?.({
    name: `${targetNodeConfig.label} ${labelVersion}`,
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
