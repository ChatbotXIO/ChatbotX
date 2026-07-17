import type { SmartDelayStepCountRow } from "@chatbotx.io/business/smart-delay"
import type { SmartDelayStatus } from "@chatbotx.io/database/partials"
import {
  type FlowNode,
  type NodeType,
  nodeTypeSchema,
} from "@chatbotx.io/flow-config"

export type SmartDelayNodeStats = {
  waiting: number
  sent: number
}

const emptySmartDelayNodeStats = (): SmartDelayNodeStats => ({
  waiting: 0,
  sent: 0,
})

const SMART_DELAY_STATUS_BUCKETS: Record<
  SmartDelayStatus,
  keyof SmartDelayNodeStats | null
> = {
  pending: "waiting",
  scheduled: "waiting",
  completed: "sent",
  canceled: null,
  failed: null,
}

export const smartDelayAnalyticsNodeTypes = [
  nodeTypeSchema.enum.wait,
  nodeTypeSchema.enum.followUp,
] as const

const smartDelayAnalyticsNodeTypeSet = new Set<NodeType>(
  smartDelayAnalyticsNodeTypes,
)

const getFirstStepId = (node: FlowNode): string | null => {
  const details = node.data.details
  if (!("steps" in details)) {
    return null
  }

  return details.steps[0]?.id ?? null
}

export function buildSmartDelayNodeStats(
  nodes: FlowNode[],
  rows: SmartDelayStepCountRow[],
): Record<string, SmartDelayNodeStats> {
  const statsByNodeId: Record<string, SmartDelayNodeStats> = {}
  const nodeIdByStepId = new Map<string, string>()

  for (const node of nodes) {
    if (!smartDelayAnalyticsNodeTypeSet.has(node.type as NodeType)) {
      continue
    }

    statsByNodeId[node.id] = emptySmartDelayNodeStats()
    const stepId = getFirstStepId(node)
    if (stepId) {
      nodeIdByStepId.set(stepId, node.id)
    }
  }

  for (const row of rows) {
    const bucket = SMART_DELAY_STATUS_BUCKETS[row.status]
    const nodeId = nodeIdByStepId.get(row.stepId)
    if (!(bucket && nodeId)) {
      continue
    }

    statsByNodeId[nodeId][bucket] += row.total
  }

  return statsByNodeId
}
