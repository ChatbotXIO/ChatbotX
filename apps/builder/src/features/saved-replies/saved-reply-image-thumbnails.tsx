"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { XCircleIcon } from "lucide-react"
import Image from "next/image"
import type {
  SavedReplyImageResource,
  SavedReplyResource,
} from "./schema/resource"

export type SavedReplyImagePreview = Pick<
  SavedReplyImageResource,
  "mediaLibraryFileId" | "name" | "url"
>

export const SavedReplyImageThumbnails = ({
  images,
  onRemove,
  size = "md",
}: {
  images: SavedReplyImagePreview[]
  onRemove?: (mediaLibraryFileId: string) => void
  size?: "sm" | "md"
}) => {
  const dimension = size === "sm" ? 32 : 56

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((image) => (
        <div className="relative" key={image.mediaLibraryFileId}>
          <Image
            alt={image.name}
            className="rounded-md border object-cover"
            height={dimension}
            src={image.url}
            style={{ height: dimension, width: dimension }}
            width={dimension}
          />
          {onRemove ? (
            <Button
              aria-label={image.name}
              className="absolute -end-2 -top-2 size-5 rounded-full bg-background p-0"
              onClick={() => onRemove(image.mediaLibraryFileId)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XCircleIcon className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** Every image the reply carries, as small thumbnails in send order. */
export const SavedReplyImagesSummary = ({
  images,
}: {
  images: SavedReplyResource["images"]
}) => {
  if (images.length === 0) {
    return null
  }

  return (
    <div className="mt-1">
      <SavedReplyImageThumbnails images={images} size="sm" />
    </div>
  )
}
