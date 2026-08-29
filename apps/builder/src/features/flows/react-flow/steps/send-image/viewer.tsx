"use client"

import type { SendImageStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import Image from "next/image"
import { DynamicImagePreviewPlaceholder } from "@/features/dynamic-images/components/preview-placeholder"
import { useDynamicImagePreview } from "@/features/dynamic-images/hooks/use-dynamic-image-preview"
import { ButtonGroupViewer } from "../button/viewer"

type SendImageStepViewerProps = {
  data: SendImageStepSchema
}

const SendImageStepViewer = (props: SendImageStepViewerProps) => {
  const { data } = props
  const { url: previewUrl, hasError } = useDynamicImagePreview(data.url)

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="p-0">
        {previewUrl ? (
          <div className="relative h-37.5">
            <Image
              alt={data.id}
              className="h-full w-full object-contain"
              fill={true}
              src={previewUrl}
            />
          </div>
        ) : (
          hasError && <DynamicImagePreviewPlaceholder hasError={hasError} />
        )}
        {data.buttons.length > 0 && <ButtonGroupViewer data={data.buttons} />}
      </CardContent>
    </Card>
  )
}

export default SendImageStepViewer
