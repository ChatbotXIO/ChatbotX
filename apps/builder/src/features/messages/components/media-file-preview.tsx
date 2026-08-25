"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PaperclipIcon, XCircleIcon } from "lucide-react"
import Image from "next/image"
import { useFormContext, useWatch } from "react-hook-form"

type MediaFileFieldValue = {
  path: string
  url?: string
  mimeType: string
  name?: string | null
  size: number
}

export const MediaFilePreview = () => {
  const { control, setValue } = useFormContext()

  const mediaFile: MediaFileFieldValue | undefined = useWatch({
    control,
    name: "mediaFile",
  })

  if (!mediaFile) {
    return null
  }

  const isImage = mediaFile.mimeType.startsWith("image")

  return (
    <div className="flex items-center gap-2">
      <div className="relative rounded-md border">
        <div className="max-w-36 overflow-hidden rounded-md">
          {isImage && mediaFile.url ? (
            <Image
              alt={mediaFile.name ?? "file"}
              className="h-16 w-auto"
              height={64}
              src={mediaFile.url}
              width={64}
            />
          ) : (
            <div className="flex items-center gap-1.5 truncate bg-white px-2 py-1 text-sm dark:bg-neutral-900">
              <PaperclipIcon className="size-3.5 shrink-0" />
              {mediaFile.name}
            </div>
          )}
        </div>

        <Button
          className="absolute -end-2 -top-2 h-auto rounded-full bg-white p-0 px-0 dark:bg-neutral-600"
          onClick={() =>
            setValue("mediaFile", undefined, { shouldValidate: true })
          }
          type="button"
          variant="ghost"
        >
          <XCircleIcon />
        </Button>
      </div>
    </div>
  )
}
