"use client"

import type { SendCardStepSchema } from "@aha.chat/flow-config"
import { ImageIcon } from "lucide-react"
import Image from "next/image"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendCardStepViewerProps = {
  data: SendCardStepSchema
}

const SendCardStepViewer = (props: SendCardStepViewerProps) => {
  const { data } = props

  return (
    <div className="flex flex-col rounded-lg bg-secondary">
      <div className="mb-3 flex flex-col gap-1">
        {data.image?.url ? (
          <div className="relative h-[150px]">
            <Image
              alt={data.title}
              className="h-full w-full object-contain"
              fill={true}
              src={data.image.url}
            />
          </div>
        ) : (
          <div className="flex min-h-[100px] items-center justify-center">
            <ImageIcon color="grey" size={25} />
          </div>
        )}
        <div className="px-2 font-medium text-sm">
          {data.title || "--title--"}
        </div>
        <div className="px-2 text-sm">{data.subtitle || "--subtitle--"}</div>
      </div>
      {data.buttons.length > 0 && (
        <div className="bg-slate-200 px-3 py-2">
          <ButtonGroupViewer data={data.buttons} />
        </div>
      )}
    </div>
  )
}

export default SendCardStepViewer
