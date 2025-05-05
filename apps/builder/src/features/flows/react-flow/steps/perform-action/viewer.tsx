"use client"

import type { PerformActionStepSchema } from "./schema"

const PerformActionStepViewer = ({
  // biome-ignore lint/correctness/noUnusedVariables: <explanation>
  data,
}: {
  data: PerformActionStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">Additional Actions</p>
    </div>
  )
}

export default PerformActionStepViewer
