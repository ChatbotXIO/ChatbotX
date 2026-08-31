"use client"

import type { SendMultipleImagesStepSchema } from "@chatbotx.io/flow-config"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import Image from "next/image"
import { DynamicImagePreviewPlaceholder } from "@/features/dynamic-images/components/preview-placeholder"
import { useDynamicImagePreview } from "@/features/dynamic-images/hooks/use-dynamic-image-preview"

type SendMultipleImagesStepViewerProps = {
  data: SendMultipleImagesStepSchema
}

const SendMultipleImagesStepViewer = (
  props: SendMultipleImagesStepViewerProps,
) => {
  const { data } = props

  return (
    <Card className="overflow-hidden p-0">
      <CardContent className="grid grid-cols-3 gap-1 p-1">
        {data.images.map((image) => (
          <GridImagePreviewItem
            imageId={image.id}
            key={image.id}
            url={image.url}
          />
        ))}
      </CardContent>
    </Card>
  )
}

const GridImagePreviewItem = (props: { imageId: string; url: string }) => {
  const { imageId, url } = props
  const { url: previewUrl, hasError } = useDynamicImagePreview(url)

  if (!previewUrl) {
    return hasError ? (
      <div className="relative aspect-square overflow-hidden rounded">
        <DynamicImagePreviewPlaceholder hasError={hasError} />
      </div>
    ) : null
  }

  return (
    <div className="relative aspect-square overflow-hidden rounded">
      <Image
        alt={imageId}
        className="h-full w-full object-cover"
        height={120}
        src={previewUrl}
        width={120}
      />
    </div>
  )
}

export default SendMultipleImagesStepViewer
