"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import {
  isImageMimeType,
  SAVED_REPLY_MAX_IMAGES,
} from "@chatbotx.io/utils/inbox-image-support"
import { ImagePlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useFormContext } from "react-hook-form"
import { toast } from "sonner"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import type { ListFilesResponse } from "@/features/media-library/schema"
import {
  type SavedReplyImagePreview,
  SavedReplyImageThumbnails,
} from "./saved-reply-image-thumbnails"

type MediaFile = ListFilesResponse["data"][number]

const toPreview = (file: MediaFile): SavedReplyImagePreview => ({
  mediaLibraryFileId: file.id,
  name: file.name,
  url: file.url,
})

/**
 * Picks the saved reply's images from the media library. The form only
 * carries the ordered `imageFileIds`; names and urls live here for the
 * thumbnails.
 */
export const SavedReplyImagesField = ({
  workspaceId,
  initialImages,
}: {
  workspaceId: string
  initialImages: SavedReplyImagePreview[]
}) => {
  const t = useTranslations()
  const { setValue } = useFormContext<{ imageFileIds?: string[] }>()
  const [images, setImages] = useState(initialImages)

  useEffect(() => {
    setImages(initialImages)
  }, [initialImages])

  const updateImages = (next: SavedReplyImagePreview[]) => {
    setImages(next)
    setValue(
      "imageFileIds",
      next.map((image) => image.mediaLibraryFileId),
      { shouldDirty: true, shouldValidate: true },
    )
  }

  const addImages = (files: MediaFile[]) => {
    const imageFiles = files.filter((file) => isImageMimeType(file.mimeType))
    if (imageFiles.length < files.length) {
      toast.error(t("messages.onlyImagesAllowed"))
    }

    const knownIds = new Set(images.map((image) => image.mediaLibraryFileId))
    const merged = [
      ...images,
      ...imageFiles.filter((file) => !knownIds.has(file.id)).map(toPreview),
    ]
    if (merged.length > SAVED_REPLY_MAX_IMAGES) {
      toast.error(
        t("messages.tooManySavedReplyImages", { max: SAVED_REPLY_MAX_IMAGES }),
      )
    }
    updateImages(merged.slice(0, SAVED_REPLY_MAX_IMAGES))
  }

  const removeImage = (mediaLibraryFileId: string) => {
    updateImages(
      images.filter((image) => image.mediaLibraryFileId !== mediaLibraryFileId),
    )
  }

  return (
    <div className="space-y-2">
      <Label>{t("fields.images.label")}</Label>
      {images.length > 0 ? (
        <SavedReplyImageThumbnails images={images} onRemove={removeImage} />
      ) : null}
      {images.length < SAVED_REPLY_MAX_IMAGES ? (
        <MediaLibraryTrigger
          fileType="image"
          multiple
          onSelect={(file) => addImages([file])}
          onSelectMultiple={addImages}
          workspaceId={workspaceId}
        >
          <Button size="sm" type="button" variant="outline">
            <ImagePlusIcon />
            {t("mediaLibrary.openMediaLibrary")}
          </Button>
        </MediaLibraryTrigger>
      ) : null}
    </div>
  )
}
