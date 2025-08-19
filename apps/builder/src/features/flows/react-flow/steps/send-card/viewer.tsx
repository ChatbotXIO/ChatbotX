"use client"

import type { SendCardStepSchema } from "@aha.chat/flow-config"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@aha.chat/ui/components/ui/card"
import { Label } from "@aha.chat/ui/components/ui/label"
import { ImageIcon } from "lucide-react"
import Image from "next/image"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendCardStepViewerProps = {
  data: SendCardStepSchema
}

export const SendCardStepViewer = (props: SendCardStepViewerProps) => {
  const { data } = props

  return (
    <Card className="mb-3">
      <CardHeader className="p-0">
        {data.image?.url ? (
          <Image
            alt={data.title}
            className="rounded-t-lg"
            src={data.image.url}
          />
        ) : (
          <div className="flex min-h-[100px] items-center justify-center">
            <ImageIcon color="grey" size={25} />
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 break-all bg-gray-200 p-2">
        <Label className="capitalize">{data.title || "Title"}</Label>
        <Label className="text-gray-400 text-sm">
          {data.subtitle || "Subtitle"}
        </Label>
      </CardContent>
      {data.buttons && data.buttons.length > 0 && (
        <CardFooter className="bg-gray-200 p-2">
          <ButtonGroupViewer data={data.buttons} />
        </CardFooter>
      )}
    </Card>
  )
}
