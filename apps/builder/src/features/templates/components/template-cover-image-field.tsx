"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { ImageIcon, ImagePlusIcon, XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { MediaLibraryTrigger } from "@/features/media-library/components"

type TemplateCoverImageFieldProps = {
  workspaceId: string
  previewUrl: string | undefined
  /** The storage path of the media-library image the publisher picked. */
  onSelect: (path: string) => void
  onClear: () => void
}

/** The template's cover image, picked from the workspace media library (never uploaded straight here). */
export function TemplateCoverImageField({
  workspaceId,
  previewUrl,
  onSelect,
  onClear,
}: TemplateCoverImageFieldProps) {
  const t = useTranslations()

  return (
    <div className="flex flex-col gap-2">
      <div className="flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-lg border">
        {previewUrl ? (
          // biome-ignore lint/performance/noImgElement: previews a media-library file whose final render is a server-resolved public URL
          <img
            alt=""
            className="size-full object-cover"
            height={720}
            src={previewUrl}
            width={1280}
          />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}
      </div>
      <div className="flex gap-2">
        <MediaLibraryTrigger
          fileType="image"
          onSelect={(file) => onSelect(file.path)}
          workspaceId={workspaceId}
        >
          <Button size="sm" type="button" variant="outline">
            <ImagePlusIcon />
            {t("mediaLibrary.openMediaLibrary")}
          </Button>
        </MediaLibraryTrigger>
        {previewUrl ? (
          <Button onClick={onClear} size="sm" type="button" variant="ghost">
            <XIcon />
            {t("actions.remove")}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
