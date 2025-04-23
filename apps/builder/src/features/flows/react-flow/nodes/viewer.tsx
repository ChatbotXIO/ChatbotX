import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Handle, Position } from "@xyflow/react"
import { DynamicStepViewer } from "../steps"
import type { FlowNode } from "../types"
import { allNodesConfig } from "./node-config"
import { FlowNodeToolbar } from "./node-toolbar"

export function NodeViewer({
  id,
  type,
  data,
}: { id: string; type: FlowNode["type"]; data: FlowNode["data"] }) {
  const nodeConfig = Object.values(allNodesConfig).find((n) => n?.type === type)

  return (
    <HoverCard openDelay={0} closeDelay={0}>
      <HoverCardTrigger asChild>
        <Card className="w-72 hover:border-blue-500 bg-white/75 p-0">
          <CardHeader className="p-4 relative">
            <Handle id={id} type="target" position={Position.Left} />
            <CardTitle className="flex gap-1 items-center">
              {nodeConfig?.icon ? <nodeConfig.icon className="size-5" /> : " "}
              {data.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data.steps.map((stepItem) => (
              <DynamicStepViewer
                key={stepItem.id}
                type={stepItem.stepType}
                data={stepItem}
              />
            ))}
            <div className="w-full relative text-right">
              <span className="mr-4">Continue</span>
              <BaseHandle id={id} type="source" position={Position.Right} />
            </div>
          </CardContent>
        </Card>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        className="bg-transparent border-none shadow-none p-0"
      >
        <FlowNodeToolbar />
      </HoverCardContent>
    </HoverCard>
  )
}
