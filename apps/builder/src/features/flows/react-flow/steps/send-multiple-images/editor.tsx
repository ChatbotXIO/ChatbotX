"use client"

import { sendMultipleImagesItemDefaultFn } from "@chatbotx.io/flow-config"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImageIcon,
  ImagesIcon,
  Trash2Icon,
} from "lucide-react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useFormContext, useWatch } from "react-hook-form"
import { MediaLibraryTrigger } from "@/features/media-library/components/media-library-trigger"
import { useWorkspaceId } from "@/hooks/routing"

const MAX_IMAGES = 10
const MIN_IMAGES = 2

type SendMultipleImagesStepEditorProps = {
  parentName: string
}

const SendMultipleImagesStepEditor = (
  props: SendMultipleImagesStepEditorProps,
) => {
  const { parentName } = props
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const { control, setValue } = useFormContext()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `${parentName}.images`,
  })
  const images: Array<{ url?: string }> =
    useWatch({ control, name: `${parentName}.images` }) ?? []

  const [currentIndex, setCurrentIndex] = useState(0)
  // Derived from `images` (useWatch), not `fields.length` (useFieldArray) —
  // the two can be one render out of sync right after append()/setValue(),
  // which showed up as the thumbnail for a slot rendering its image fine
  // while the header preview (indexed off a stale count) did not.
  const clampedIndex = Math.min(currentIndex, images.length - 1)
  const currentUrl = images[clampedIndex]?.url
  const canRemove = images.length > MIN_IMAGES

  const goPrev = () => setCurrentIndex((i) => Math.max(0, i - 1))
  const goNext = () =>
    setCurrentIndex((i) => Math.min(images.length - 1, i + 1))

  const removeImage = (index: number) => {
    if (!canRemove) {
      return
    }
    remove(index)
  }

  // Fills any empty slots first (e.g. the two blank slots a fresh step
  // starts with), then appends the rest as new slots, up to the max. Always
  // focuses whichever slot was touched last.
  const handleMediaLibrarySelection = (
    selectedFiles: Array<{ url: string }>,
  ) => {
    if (selectedFiles.length === 0) {
      return
    }

    const emptySlotIndexes = images
      .map((image, index) => (image.url ? -1 : index))
      .filter((index) => index !== -1)

    let fileIndex = 0
    let lastTouchedIndex = clampedIndex

    for (const slotIndex of emptySlotIndexes) {
      if (fileIndex >= selectedFiles.length) {
        break
      }
      setValue(
        `${parentName}.images.${slotIndex}.url`,
        selectedFiles[fileIndex].url,
        { shouldValidate: true, shouldDirty: true },
      )
      lastTouchedIndex = slotIndex
      fileIndex += 1
    }

    const startLength = images.length
    let appended = 0
    while (
      fileIndex < selectedFiles.length &&
      startLength + appended < MAX_IMAGES
    ) {
      append({
        ...sendMultipleImagesItemDefaultFn(),
        mode: "file",
        url: selectedFiles[fileIndex].url,
      })
      fileIndex += 1
      appended += 1
    }
    if (appended > 0) {
      lastTouchedIndex = startLength + appended - 1
    }

    setCurrentIndex(lastTouchedIndex)
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header: preview + prev/next */}
      <div className="relative flex h-24 items-center justify-center">
        <Button
          className="absolute left-2 size-8 rounded-full"
          disabled={clampedIndex === 0}
          onClick={goPrev}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronLeftIcon />
        </Button>

        {currentUrl ? (
          <div className="h-20 w-32 select-none overflow-hidden rounded-lg">
            <Image
              alt=""
              className="h-full w-full object-contain"
              height={80}
              src={currentUrl}
              width={128}
            />
          </div>
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" />
        )}

        <Button
          className="absolute right-2 size-8 rounded-full"
          disabled={clampedIndex >= images.length - 1}
          onClick={goNext}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRightIcon />
        </Button>
      </div>

      <div className="border-t" />

      {/* Body: thumbnail strip */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {fields.map((field, index) => (
          <Button
            className={cn(
              "group relative size-8 shrink-0 overflow-hidden rounded-lg border-2 p-0",
              index === clampedIndex
                ? "border-primary"
                : "border-transparent bg-secondary",
            )}
            key={field.id}
            onClick={() => setCurrentIndex(index)}
            type="button"
            variant="ghost"
          >
            {images[index]?.url ? (
              <Image
                alt=""
                className="object-cover"
                fill
                sizes="32px"
                src={images[index].url ?? ""}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-secondary">
                <ImageIcon className="size-3 text-muted-foreground" />
              </div>
            )}

            {canRemove && (
              // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only secondary action, mirrors media-library-dialog's nested-action pattern
              // biome-ignore lint/a11y/useSemanticElements: a <button> can't nest inside the outer thumbnail <button>
              <div
                className="absolute top-0 right-0 hidden rounded bg-background/80 p-0.5 group-hover:flex"
                onClick={(e) => {
                  e.stopPropagation()
                  removeImage(index)
                }}
                role="button"
                tabIndex={0}
                title={t("flows.sendMultipleImages.removeImage")}
              >
                <Trash2Icon className="size-2.5 text-destructive" />
              </div>
            )}
          </Button>
        ))}
      </div>

      <div className="border-t" />

      {/* Footer: select images */}
      <div className="px-4 py-2">
        <MediaLibraryTrigger
          multiple={true}
          onSelect={(file) => handleMediaLibrarySelection([file])}
          onSelectMultiple={handleMediaLibrarySelection}
          workspaceId={workspaceId}
        >
          <Button
            className="w-full"
            disabled={images.length >= MAX_IMAGES}
            size="sm"
            type="button"
            variant="outline"
          >
            <ImagesIcon className="size-4" />
            {t("flows.sendMultipleImages.selectImage")}
          </Button>
        </MediaLibraryTrigger>
      </div>
    </div>
  )
}

export default SendMultipleImagesStepEditor
