"use client"

import type { SendGifStepSchema } from "@aha.chat/flow-config"
import Image from "next/image"

type SendGifStepViewerProps = {
  data: SendGifStepSchema
}

export const SendGifStepViewer = (props: SendGifStepViewerProps) => {
  const { data } = props

  return (
    <div className="items-center justify-center overflow-hidden rounded-lg bg-secondary">
      {data.url?.startsWith("https") && (
        <div className="relative h-[150px]">
          <Image
            alt={data.id}
            className="h-full w-full object-contain"
            fill={true}
            src={data.url}
          />
        </div>
      )}
    </div>
  )
}
