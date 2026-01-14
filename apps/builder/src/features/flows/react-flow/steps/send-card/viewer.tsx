"use client"

import type { SendCardStepSchema } from "@aha.chat/flow-config"
import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import { ImageIcon } from "lucide-react"
import Image from "next/image"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendCardStepViewerProps = {
  data: SendCardStepSchema
}

const SendCardStepViewer = (props: SendCardStepViewerProps) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="mb-3 flex flex-col gap-1">
          {"image" in data && data.image?.url ? (
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
          <div className="px-2 text-sm">
            {"subtitle" in data
              ? data.subtitle || "--subtitle--"
              : "--subtitle--"}
          </div>
        </div>
        {"buttons" in data && data.buttons.length > 0 && (
          <ButtonGroupViewer data={data.buttons} />
        )}
      </CardContent>
    </Card>
  )
}

export default SendCardStepViewer
