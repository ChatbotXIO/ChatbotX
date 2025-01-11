"use client"

import { ButtonGroupViewer } from "../button/viewer"
import type { SendTextBlockSchema } from "./schema"

export const SendTextBlockViewer = ({
  data,
}: { data: SendTextBlockSchema }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary mb-2">
      <p className="px-4 py-2">{data.message}</p>
      <div className="bg-slate-200 p-4">
        <ButtonGroupViewer data={data.buttons} />
      </div>
    </div>
  )
}
