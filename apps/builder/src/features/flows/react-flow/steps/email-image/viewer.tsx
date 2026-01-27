"use client"

import type { EmailImageStepSchema } from "@aha.chat/flow-config"
import Image from "next/image"

type EmailImageStepViewerProps = {
  data: EmailImageStepSchema
}

export default function EmailImageStepViewer(props: EmailImageStepViewerProps) {
  const { data } = props

  return (
    <div className="relative h-[150px]">
      {data.url?.startsWith("https") ? (
        <Image
          alt={data.id}
          className="h-full w-full object-contain"
          fill={true}
          src={data.url}
        />
      ) : null}
    </div>
  )
}
