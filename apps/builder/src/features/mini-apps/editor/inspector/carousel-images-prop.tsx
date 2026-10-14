"use client"

import {
  MINI_APP_MAX_IMAGE_BASE64_LENGTH,
  type MiniAppImageItem,
} from "@chatbotx.io/mini-app"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { readArray } from "../../lib/props"
import { FieldRow, useInspector } from "./field-row"
import { ImagePicker } from "./image-picker"
import { ItemControls } from "./item-controls"
import { moveItem, patchItem, removeItem } from "./list-editing"

/** Meta shows at most this many images in one ImageCarousel. */
const MAX_CAROUSEL_IMAGES = 3

export function CarouselImagesProp() {
  const t = useTranslations("miniApps.inspector")
  const { props, setProp } = useInspector()
  const images = readArray<MiniAppImageItem>(props.images)
  const update = (next: MiniAppImageItem[]) => setProp("images", next)
  return (
    <FieldRow propKey="images">
      <div className="flex flex-col gap-2">
        {images.map((image, index) => (
          <div
            className="flex items-center justify-between gap-2 rounded-md border p-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: images have no id
            key={index}
          >
            <ImagePicker
              maxLength={MINI_APP_MAX_IMAGE_BASE64_LENGTH}
              onChange={(src) => update(patchItem(images, index, { src }))}
              value={image.src}
            />
            <ItemControls
              count={images.length}
              index={index}
              onMove={(to) => update(moveItem(images, index, to))}
              onRemove={() => update(removeItem(images, index))}
            />
          </div>
        ))}
        {images.length < MAX_CAROUSEL_IMAGES ? (
          <Button
            onClick={() => update([...images, { src: images[0]?.src }])}
            size="sm"
            type="button"
            variant="outline"
          >
            <PlusIcon className="size-4" />
            {t("addImage")}
          </Button>
        ) : null}
      </div>
    </FieldRow>
  )
}
