"use client"

import type { SplitTrafficStepSchema } from "@aha.chat/flow-config"

export const SplitTrafficStepViewer = ({
  data,
}: {
  data: SplitTrafficStepSchema
}) => (
  <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
    <p className="px-4 py-2">{`${data.value}%`}</p>
  </div>
)
