"use client"

import type { SendImageStepSchema } from "@/features/flows/react-flow/steps/send-image/schema"
import { ButtonGroupViewer } from "../button/viewer"

export const SendImageStepViewer = ({
  data,
}: {
  data: SendImageStepSchema
}) => {
  return (
    <div className="items-center rounded-lg overflow-hidden justify-center bg-secondary">
      {data.url?.startsWith("http") && (
        <div className="h-[150px]">
          <img
            src={data.url}
            alt={data.id}
            className="w-full h-full object-contain"
          />
        </div>
      )}
      {data.buttons.length > 0 && (
        <div className="bg-slate-200 px-3 py-2">
          <ButtonGroupViewer data={data.buttons} />
        </div>
      )}
    </div>
  )
}
