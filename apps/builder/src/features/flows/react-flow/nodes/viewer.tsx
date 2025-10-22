import type { FlowNode, NodeType } from "@aha.chat/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { Handle, NodeToolbar, Position } from "@xyflow/react"
import { PlayCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { BaseHandle } from "@/components/base-handle"
import { DynamicStepViewer } from "../steps"
import { FlowNodeToolbar } from "../toolbar/node-toolbar"
import { allNodesConfig } from "./node-config"

export const NodeViewer = memo(
  ({
    id,
    type,
    data,
  }: {
    id: string
    type: FlowNode["type"]
    data: FlowNode["data"]
  }) => {
    const t = useTranslations()

    const nodeConfig = allNodesConfig[type as NodeType]?.(t)

    return data && nodeConfig ? (
      <>
        {/* NOTES: Dirty hack to show toolbar */}
        <div className="-translate-y-full absolute min-h-6 w-full transform">
          {data.isStartNode && (
            <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
              <PlayCircleIcon className="text-sm" size={16} />
              Start
            </div>
          )}
        </div>
        {/* biome-ignore lint/suspicious/noExplicitAny: wip */}
        <NodeToolbar isVisible={(data as any).forceToolbarVisible} offset={5}>
          <FlowNodeToolbar />
        </NodeToolbar>
        <Card className="w-72 gap-0 bg-white/75 p-0 hover:border-blue-500">
          <CardHeader className="relative p-4">
            <Handle id={id} position={Position.Left} type="target" />
            <CardTitle className="flex items-center gap-1">
              {nodeConfig?.icon ? <nodeConfig.icon className="size-5" /> : " "}
              {data.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4 pt-0">
            {data.steps &&
              data.steps.length > 0 &&
              data.steps.map((stepItem) => (
                <DynamicStepViewer
                  data={stepItem}
                  key={stepItem.id}
                  type={stepItem.stepType}
                />
              ))}
            <div className="relative w-full text-right">
              <span className="mr-4">Continue</span>
              <BaseHandle id={id} position={Position.Right} type="source" />
            </div>
          </CardContent>
        </Card>
      </>
    ) : (
      <div>Node not found</div>
    )
  },
)
