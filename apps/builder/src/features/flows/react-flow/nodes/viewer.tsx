import { BaseHandle } from "@/components/base-handle"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Handle, NodeToolbar, Position } from "@xyflow/react"
import { DynamicStepViewer } from "../steps"
import type { FlowNode } from "../types"
import { allNodesConfig } from "./node-config"
import { FlowNodeToolbar } from "../toolbar/node-toolbar"
import { PlayCircleIcon } from "lucide-react"

export function NodeViewer({
  id,
  type,
  data,
}: {
  id: string
  type: FlowNode["type"]
  data: FlowNode["data"]
}) {
  const nodeConfig = Object.values(allNodesConfig).find((n) => n?.type === type)

  return (
    <>
      {/* NOTES: Dirty hack to show toolbar */}
      <div className="absolute w-full min-h-6 transform -translate-y-full">
        {data.isStartNode && (
          <div className="inline-flex gap-1 rounded-xl border py-0.5 px-1.5 text-sm bg-destructive text-white items-center">
            <PlayCircleIcon className="text-sm" size={16} />
            Start
          </div>
        )}
      </div>
      {/* biome-ignore lint/suspicious/noExplicitAny: <explanation> */}
      <NodeToolbar isVisible={(data as any).forceToolbarVisible} offset={5}>
        <FlowNodeToolbar />
      </NodeToolbar>
      <Card className="w-72 hover:border-blue-500 bg-white/75 p-0 gap-0">
        <CardHeader className="p-4 relative">
          <Handle id={id} type="target" position={Position.Left} />
          <CardTitle className="flex gap-1 items-center">
            {nodeConfig?.icon ? <nodeConfig.icon className="size-5" /> : " "}
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0 flex flex-col gap-4">
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
    </>
  )
}
