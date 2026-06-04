"use client"

import type { NodeResponse } from "@chatbotx.io/analytics/schemas"
import type { FlowNode, NodeType } from "@chatbotx.io/flow-config"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { Position } from "@xyflow/react"
import { useTranslations } from "next-intl"
import { memo } from "react"
import { BaseHandle } from "@/components/base-handle"
import { DynamicStepViewer } from "../steps"
import { ButtonStepViewer } from "../steps/button/viewer"
import { FlowAnalyticsStoreProvider } from "../stores/flow-analytics-store-provider"
import { allNodesConfig } from "./node-config"

type NodeAnalyticsViewerProps = {
  id: string
  type: NodeType
  data: FlowNode["data"] & {
    analytics?: NodeResponse | null
  }
}

function StatItem({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-semibold text-sm">{value}</span>
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

export const NodeAnalyticsViewer = memo((props: NodeAnalyticsViewerProps) => {
  const { id, type, data } = props
  const t = useTranslations()

  const nodeConfig = allNodesConfig[type]?.(t)
  const analytics = data.analytics

  const sent = analytics?.node["message:sent"] ?? 0
  const delivered = analytics?.node["message:delivered"] ?? 0
  const seen = analytics?.node["message:seen"] ?? 0
  const clicked = analytics?.node["flow:clicked"]?.clicked ?? 0

  const deliveredPercent = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const seenPercent = sent > 0 ? Math.round((seen / sent) * 100) : 0
  const clickedPercent = sent > 0 ? Math.round((clicked / sent) * 100) : 0

  const buttonStats: Record<string, number> = {}
  if (analytics?.buttons) {
    for (const [buttonId, btn] of Object.entries(analytics.buttons)) {
      buttonStats[buttonId] = btn.clicks
    }
  }

  return data.details && nodeConfig ? (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        {data.isStartNode && (
          <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
            Start
          </div>
        )}
      </div>

      <Card className="w-72 gap-0 p-0">
        <CardHeader className="relative gap-2 p-4">
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

          <div className="flex justify-between border-t pt-2">
            <StatItem label="Sent" value={sent} />
            <StatItem label="Delivered" value={`${deliveredPercent}%`} />
            <StatItem label="Seen" value={`${seenPercent}%`} />
            <StatItem label="Clicked" value={`${clickedPercent}%`} />
          </div>
        </CardHeader>

        <FlowAnalyticsStoreProvider buttonStats={buttonStats} totalSent={sent}>
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

            {"quickReplies" in data.details &&
              data.details.quickReplies &&
              data.details.quickReplies.length > 0 &&
              data.details.quickReplies.map((quickReplyItem) => (
                <ButtonStepViewer
                  data={quickReplyItem}
                  key={quickReplyItem.id}
                />
              ))}

            <div className="relative w-full text-right">
              <span className="mr-4">{t("actions.continue")}</span>
              <BaseHandle id={id} position={Position.Right} type="source" />
            </div>
          </CardContent>
        </FlowAnalyticsStoreProvider>
      </Card>
    </>
  ) : (
    <div>Node not found</div>
  )
})

NodeAnalyticsViewer.displayName = "NodeAnalyticsViewer"
