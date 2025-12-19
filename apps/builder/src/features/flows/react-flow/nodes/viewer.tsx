import type { FlowNode, NodeType } from "@aha.chat/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { NodeToolbar, Position } from "@xyflow/react"
import { PlayCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { BaseHandle } from "@/components/base-handle"
import { DynamicStepViewer } from "../steps"
import { FlowNodeToolbar } from "../toolbar/node-toolbar"
import { allNodesConfig } from "./node-config"

type NodeViewerProps = {
  id: string
  type: NodeType
  data: FlowNode["data"] & { forceToolbarVisible?: boolean }
}

export const NodeViewer = memo((props: NodeViewerProps) => {
  const { id, type, data } = props
  const t = useTranslations()

  const nodeConfig = allNodesConfig[type]?.(t)

  return data.details && nodeConfig ? (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        {data.isStartNode && (
          <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
            <PlayCircleIcon className="text-sm" size={16} />
            Start
          </div>
        )}
      </div>

      <NodeToolbar isVisible={data.forceToolbarVisible} offset={5}>
        <FlowNodeToolbar isStartNode={data.isStartNode} />
      </NodeToolbar>

      <Card className="w-72 gap-0 bg-white/75 p-0 hover:border-blue-500">
        <CardHeader className="relative p-4">
          <BaseHandle
            id={id}
            isConnectableStart={false}
            position={Position.Left}
            type="target"
          />
          <CardTitle className="flex items-center gap-1">
            {nodeConfig?.icon ? <nodeConfig.icon className="size-5" /> : " "}
            {data.name}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-4 pt-0">
          {"steps" in data.details &&
            data.details.steps &&
            data.details.steps.length > 0 &&
            data.details.steps.map((stepItem) => (
              <DynamicStepViewer
                data={stepItem}
                key={stepItem.id}
                type={stepItem.stepType}
              />
            ))}
          <div className="relative w-full text-right">
            <span className="mr-4">{t("actions.continue")}</span>
            <BaseHandle id={id} position={Position.Right} type="source" />
          </div>
        </CardContent>
      </Card>
    </>
  ) : (
    <div>Node not found</div>
  )
})
