"use client"

import {
  SelectedSnapDisplay,
  useSelectedSnapDisplay,
} from "@chatbotx.io/ui/components/carousel-snap"
import { InputField } from "@chatbotx.io/ui/components/form/input-field"
import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@chatbotx.io/ui/components/ui/carousel"
import { PlusIcon, TrashIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { MediaLibraryOrInsertLink } from "@/components/media-library-or-insert-link"
import {
  MM_ELEMENT_SUBTITLE_MAX,
  MM_ELEMENT_TITLE_MAX,
  MM_MAX_ELEMENTS,
  mmGenericElementDefaultFn,
} from "../../schema/content"
import { ButtonListField } from "./button-list-field"

/**
 * Generic-template cards, capped at Meta's 10, as a carousel.
 *
 * One card per slide, mirroring the flow builder's Send Carousel editor: ten
 * stacked cards — each with a title, a 250-character subtitle, an image picker
 * and up to three buttons — made the form unusably tall.
 *
 * The subtitle is a textarea, not an input: Marketing Messages allows 250
 * characters here rather than the usual generic-template 80, which is too much
 * for a single-line field.
 *
 * Element images use `image_url` and so accept any hosted URL — no
 * `attachment_id` upload is needed, unlike the media template.
 */
export function GenericElementsField({ name }: { name: string }) {
  const t = useTranslations()

  const [api, setApi] = useState<CarouselApi>()
  const { selectedSnap, snapCount } = useSelectedSnapDisplay(api)

  const { control } = useFormContext()
  const { fields, append, insert, remove } = useFieldArray({ control, name })

  const insertElement = () => {
    const startIndex = selectedSnap

    if (selectedSnap === snapCount - 1) {
      append(mmGenericElementDefaultFn())
    } else {
      insert(selectedSnap + 1, mmGenericElementDefaultFn())
    }

    if (api) {
      // Embla only picks up added/removed slides after a re-init.
      api.reInit()
      api.scrollTo(startIndex, true)
    }
  }

  const removeElement = () => {
    remove(selectedSnap)

    if (api) {
      api.reInit()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="font-medium text-sm">
        {t("facebookMarketingMessages.fields.elements")}
      </div>

      <div className="relative pe-3">
        <Carousel opts={{ loop: false }} setApi={setApi}>
          <CarouselContent>
            {fields.map((field, index) => (
              <CarouselItem key={field.id}>
                <div className="flex flex-col gap-3 rounded-lg border p-3">
                  <MediaLibraryOrInsertLink
                    fileType="image"
                    parentName={`${name}.${index}.image`}
                  />

                  <InputField
                    label={t("fields.title.placeholder")}
                    maxLength={MM_ELEMENT_TITLE_MAX}
                    name={`${name}.${index}.title`}
                    required
                  />

                  <TextareaField
                    label={t("fields.subtitle.placeholder")}
                    maxLength={MM_ELEMENT_SUBTITLE_MAX}
                    name={`${name}.${index}.subtitle`}
                  />

                  <ButtonListField name={`${name}.${index}.buttons`} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>

          <div className="absolute -end-3 top-1/2 flex -translate-y-1/2 flex-col gap-2">
            <Button
              className="size-6 cursor-pointer rounded-full"
              data-slot="carousel-add"
              disabled={fields.length >= MM_MAX_ELEMENTS}
              onClick={insertElement}
              type="button"
            >
              <PlusIcon />
              <span className="sr-only">
                {t("flows.sendCarousel.addSlide")}
              </span>
            </Button>

            <Button
              className="size-6 cursor-pointer rounded-full"
              data-slot="carousel-remove"
              // `elements` is `.min(1)`, so the list may never reach zero.
              disabled={fields.length <= 1}
              onClick={removeElement}
              type="button"
              variant="destructive"
            >
              <TrashIcon />
              <span className="sr-only">
                {t("flows.sendCarousel.removeSlide")}
              </span>
            </Button>
          </div>

          <div className="mt-1 flex items-center gap-1">
            <div className="flex flex-1 gap-1">
              <CarouselPrevious className="static top-0 translate-y-0" />
              <CarouselNext className="static top-0 translate-y-0" />
            </div>

            {/* `embla__selected-snap-display` has no CSS in this repo. */}
            <span className="text-muted-foreground text-xs">
              <SelectedSnapDisplay
                selectedSnap={selectedSnap}
                snapCount={snapCount}
              />
            </span>
          </div>
        </Carousel>
      </div>
    </div>
  )
}
