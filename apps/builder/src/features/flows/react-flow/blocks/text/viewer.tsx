"use client"

import { ButtonGroupViewer } from "../button/viewer"
import { TextBlockSchema } from "./schema"

export const TextBlockViewer = ({ data }: { data: TextBlockSchema }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      <p className="px-4 py-2">{data.message}</p>
      <div className="bg-slate-200 p-4">
        <ButtonGroupViewer data={data.buttons} />
      </div>
    </div>
  )
}
