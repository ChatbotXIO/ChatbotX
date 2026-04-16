"use client"

import type { SplitTrafficStepSchema } from "@chatbotx.io/flow-config"
import { Position } from "@xyflow/react"
import { BaseHandle } from "@/components/base-handle"

type SplitTrafficStepViewerProps = {
  data: SplitTrafficStepSchema
  nodeId: string
}

const SplitTrafficStepViewer = ({
  data,
  nodeId,
}: SplitTrafficStepViewerProps) => (
  <div className="flex flex-col gap-2">
    {data.cases.map((c, i) => (
      <div
        className="relative flex items-center justify-between rounded-lg bg-secondary px-3 py-2"
        // biome-ignore lint/suspicious/noArrayIndexKey: wip
        key={`${nodeId}-case-${i}`}
      >
        <span className="font-medium">{c.value}%</span>
        <BaseHandle
          id={`${nodeId}-case-${i}`}
          position={Position.Right}
          type="source"
        />
      </div>
    ))}
  </div>
)

export default SplitTrafficStepViewer
