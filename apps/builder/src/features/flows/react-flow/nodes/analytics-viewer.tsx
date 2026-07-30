"use client"

import type { NodeResponse } from "@chatbotx.io/analytics/schemas"
import {
  disabledContinueNodeTypes,
  type FlowNode,
  type NodeType,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"
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
import type { SmartDelayNodeStats } from "../../analytics/smart-delay-node-stats"
import { DynamicStepViewer } from "../steps"
import { ButtonStepViewer } from "../steps/button/viewer"
import { FlowAnalyticsStoreProvider } from "../stores/flow-analytics-store-provider"
import { allNodesConfig } from "./node-config"

type NodeAnalyticsViewerProps = {
  id: string
  type: NodeType
  data: FlowNode["data"] & {
    analytics?: NodeResponse | null
    smartDelay?: SmartDelayNodeStats | null
  }
}

type FlowAnalyticsStatKey =
  | "clicked"
  | "delivered"
  | "seen"
  | "sent"
  | "waiting"

type StatDisplayItem = {
  labelKey: FlowAnalyticsStatKey
  value: string | number
}

type MessageStats = {
  clickedPercent: number
  deliveredPercent: number
  seenPercent: number
  sent: number
}

type StatDescriptor<TStats> = {
  labelKey: FlowAnalyticsStatKey
  value: (stats: TStats) => string | number
}

type AnalyticsVariant = "message" | "smartDelay"

const messageStatDescriptors: StatDescriptor<MessageStats>[] = [
  { labelKey: "sent", value: (stats) => stats.sent },
  {
    labelKey: "delivered",
    value: (stats) => `${stats.deliveredPercent}%`,
  },
  { labelKey: "seen", value: (stats) => `${stats.seenPercent}%` },
  { labelKey: "clicked", value: (stats) => `${stats.clickedPercent}%` },
]

const smartDelayStatDescriptors: Partial<
  Record<NodeType, StatDescriptor<SmartDelayNodeStats>[]>
> = {
  [nodeTypeSchema.enum.wait]: [
    { labelKey: "waiting", value: (stats) => stats.waiting },
    { labelKey: "sent", value: (stats) => stats.sent },
  ],
  [nodeTypeSchema.enum.followUp]: [
    { labelKey: "waiting", value: (stats) => stats.waiting },
    { labelKey: "sent", value: (stats) => stats.sent },
  ],
}

const analyticsVariantByNodeType: Partial<Record<NodeType, AnalyticsVariant>> =
  {
    [nodeTypeSchema.enum.wait]: "smartDelay",
    [nodeTypeSchema.enum.followUp]: "smartDelay",
  }

const emptySmartDelayStats: SmartDelayNodeStats = {
  waiting: 0,
  sent: 0,
}

const toPercent = (count: number, total: number) =>
  total > 0 ? Math.round((count / total) * 100) : 0

const getMessageStats = (analytics?: NodeResponse | null): MessageStats => {
  const sent = analytics?.node["message:sent"] ?? 0
  const delivered = analytics?.node["message:delivered"] ?? 0
  const seen = analytics?.node["message:seen"] ?? 0
  const clicked = analytics?.node["flow:clicked"]?.clicked ?? 0

  return {
    sent,
    deliveredPercent: toPercent(delivered, sent),
    seenPercent: toPercent(seen, sent),
    clickedPercent: toPercent(clicked, sent),
  }
}

const buildMessageStatItems = (
  data: NodeAnalyticsViewerProps["data"],
): StatDisplayItem[] => {
  const stats = getMessageStats(data.analytics)
  return messageStatDescriptors.map((descriptor) => ({
    labelKey: descriptor.labelKey,
    value: descriptor.value(stats),
  }))
}

const smartDelayDescriptorFallback: StatDescriptor<SmartDelayNodeStats>[] = []

const buildSmartDelayStatItems = (
  data: NodeAnalyticsViewerProps["data"],
  type: NodeType,
): StatDisplayItem[] => {
  const descriptors =
    smartDelayStatDescriptors[type] ?? smartDelayDescriptorFallback
  const stats = data.smartDelay ?? emptySmartDelayStats

  return descriptors.map((descriptor) => ({
    labelKey: descriptor.labelKey,
    value: descriptor.value(stats),
  }))
}

const analyticsVariantStatBuilders: Record<
  AnalyticsVariant,
  (data: NodeAnalyticsViewerProps["data"], type: NodeType) => StatDisplayItem[]
> = {
  message: (data) => buildMessageStatItems(data),
  smartDelay: buildSmartDelayStatItems,
}

const buildStatItems = (
  data: NodeAnalyticsViewerProps["data"],
  type: NodeType,
): StatDisplayItem[] => {
  const variant = analyticsVariantByNodeType[type] ?? "message"
  return analyticsVariantStatBuilders[variant](data, type)
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
  const statItems = buildStatItems(data, type)
  const messageStats = getMessageStats(data.analytics)

  const buttonStats: Record<string, number> = {}
  if (data.analytics?.buttons) {
    for (const [buttonId, btn] of Object.entries(data.analytics.buttons)) {
      buttonStats[buttonId] = btn.clicks
    }
  }

  return data.details && nodeConfig ? (
    <>
      <div className="absolute min-h-6 w-full -translate-y-full transform">
        {data.isStartNode && (
          <div className="inline-flex items-center gap-1 rounded-xl border bg-destructive px-1.5 py-0.5 text-sm text-white">
            {t("flowAnalytics.nodes.start")}
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
            {statItems.map((item) => (
              <StatItem
                key={item.labelKey}
                label={t(`flowAnalytics.stats.${item.labelKey}`)}
                value={item.value}
              />
            ))}
          </div>
        </CardHeader>

        <FlowAnalyticsStoreProvider
          buttonStats={buttonStats}
          totalSent={messageStats.sent}
        >
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

            {!disabledContinueNodeTypes.includes(type) && (
              <div className="relative w-full text-right">
                {/* React Flow keeps this connector on physical Position.Right. */}
                <span className="mr-4">{t("actions.continue")}</span>
                <BaseHandle id={id} position={Position.Right} type="source" />
              </div>
            )}
          </CardContent>
        </FlowAnalyticsStoreProvider>
      </Card>
    </>
  ) : (
    <div>{t("flowAnalytics.nodes.notFound")}</div>
  )
})

NodeAnalyticsViewer.displayName = "NodeAnalyticsViewer"
