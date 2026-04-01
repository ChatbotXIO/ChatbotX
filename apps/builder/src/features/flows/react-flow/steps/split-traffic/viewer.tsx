"use client"

import type { SplitTrafficStepSchema } from "@chatbotx.io/flow-config"

const SplitTrafficStepViewer = ({ data }: { data: SplitTrafficStepSchema }) => (
  <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
    {data.cases.length > 0 &&
      data.cases.map((c, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: safe index
        <div key={i}>
          <p>{c.value}%</p>
        </div>
      ))}
  </div>
)

export default SplitTrafficStepViewer
