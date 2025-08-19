"use client"

import type { SendImageStepSchema } from "@aha.chat/flow-config"
import Image from "next/image"
import { ButtonGroupViewer } from "../button/viewer"

type SendImageStepViewerProps = {
  data: SendImageStepSchema
}

export const SendImageStepViewer = (props: SendImageStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {data.url?.startsWith("http") && (
        <div className="h-[150px]">
          <Image
            alt={data.id}
            className="h-full w-full object-contain"
            src={data.url}
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
