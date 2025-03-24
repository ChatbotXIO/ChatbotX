"use client"

import type { SplitTrafficStepSchema } from "./schema"

export const SplitTrafficStepViewer = ({
  data,
}: {
  data: SplitTrafficStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{`${data.value}%`}</p>
    </div>
  )
}
