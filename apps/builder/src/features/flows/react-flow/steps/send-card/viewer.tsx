"use client"

import type { SendCardStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import Image from "next/image"
import { DynamicImagePreviewPlaceholder } from "@/features/dynamic-images/components/preview-placeholder"
import { useDynamicImagePreview } from "@/features/dynamic-images/hooks/use-dynamic-image-preview"
import { ButtonGroupViewer } from "@/features/flows/react-flow/steps/button/viewer"

type SendCardStepViewerProps = {
  data: SendCardStepSchema
}

const SendCardStepViewer = (props: SendCardStepViewerProps) => {
  const { data } = props
  const { url: previewUrl, hasError } = useDynamicImagePreview(
    "image" in data ? data.image?.url : undefined,
  )

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        <div className="mb-3 flex flex-col gap-1">
          {previewUrl ? (
            <div className="relative h-37.5">
              <Image
                alt={data.title}
                className="h-full w-full object-contain"
                fill={true}
                src={previewUrl}
              />
            </div>
          ) : (
            <DynamicImagePreviewPlaceholder hasError={hasError} />
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
