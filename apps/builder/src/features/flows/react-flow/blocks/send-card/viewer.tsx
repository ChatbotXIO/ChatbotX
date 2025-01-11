"use client"

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { ButtonGroupViewer } from "@/features/flows/react-flow/blocks/button/viewer"
import { Image } from "lucide-react"
import type { SendCardBlockSchema } from "./schema"

export const SendCardBlockViewer = ({
  data,
}: { data: SendCardBlockSchema }) => {
  return (
    <Card className="mb-3">
      <CardHeader className="p-0">
        {data.image?.url ? (
          <img
            className="rounded-t-lg"
            src={data.image.url}
            alt={data.title || "Title"}
          />
        ) : (
          <div className="min-h-[100px] flex items-center justify-center">
            <Image size={25} color="grey" />
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 flex flex-col gap-2 bg-gray-200 break-all">
        <Label className="capitalize">{data.title || "Title"}</Label>
        <Label className="text-gray-400 text-sm">
          {data.subtitle || "Subtitle"}
        </Label>
      </CardContent>
      {data.buttons && data.buttons.length > 0 && (
        <CardFooter className="p-2 bg-gray-200">
          <ButtonGroupViewer data={data.buttons} />
        </CardFooter>
      )}
    </Card>
  )
}
