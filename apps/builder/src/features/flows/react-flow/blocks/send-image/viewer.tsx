"use client"

import type { SendImageBlockSchema } from "@/features/flows/react-flow/blocks/send-image/schema"
import { ButtonGroupViewer } from "../button/viewer"

export const SendImageBlockViewer = ({
  data,
}: { data: SendImageBlockSchema }) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary mb-2">
      <div className="h-[150px]">
        <img
          src={data.url}
          alt={data.id}
          className="w-full h-full object-contain"
        />
      </div>
      {data.buttons.length > 0 && (
        <div className="bg-slate-200 p-4">
          <ButtonGroupViewer data={data.buttons} />
        </div>
      )}
    </div>
  )
}
