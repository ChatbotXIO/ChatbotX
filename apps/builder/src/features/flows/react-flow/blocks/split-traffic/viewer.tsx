"use client"

import type { SplitTrafficBlockSchema } from "./schema"

export const SplitTrafficBlockViewer = ({
  data,
}: { data: SplitTrafficBlockSchema }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{`${data.value}%`}</p>
    </div>
  )
}
