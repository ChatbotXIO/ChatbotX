"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { toImageSrc } from "../lib/image-src"

type CarouselImage = { src?: string; "alt-text"?: string }

/** One image at a time with previous / next buttons, like WhatsApp's carousel. */
export function ImageCarouselView({
  images,
  scaleType,
}: {
  images: CarouselImage[]
  scaleType: unknown
}) {
  const t = useTranslations("miniApps.view")
  const [index, setIndex] = useState(0)
  if (images.length === 0) {
    return null
  }
  const current = Math.min(index, images.length - 1)
  const go = (step: number) =>
    setIndex((current + step + images.length) % images.length)

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-md">
        <div
          className="flex transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${current * 100}%)` }}
        >
          {images.map((item, position) => (
            // biome-ignore lint/performance/noImgElement: inline base64 from Flow JSON
            <img
              alt={item["alt-text"] ?? ""}
              aria-hidden={position !== current}
              className={cn(
                "h-44 w-full shrink-0 bg-[#f0f2f5]",
                scaleType === "cover" ? "object-cover" : "object-contain",
              )}
              height={176}
              // biome-ignore lint/suspicious/noArrayIndexKey: images have no id
              key={position}
              src={toImageSrc(item.src)}
              width={320}
            />
          ))}
        </div>
        {images.length > 1 ? (
          <>
            <button
              aria-label={t("previousImage")}
              className="pointer-events-auto absolute start-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-[#54656f] shadow"
              onClick={(event) => {
                event.stopPropagation()
                go(-1)
              }}
              type="button"
            >
              <ChevronLeftIcon className="size-4" />
            </button>
            <button
              aria-label={t("nextImage")}
              className="pointer-events-auto absolute end-2 top-1/2 -translate-y-1/2 rounded-full bg-white/90 p-1 text-[#54656f] shadow"
              onClick={(event) => {
                event.stopPropagation()
                go(1)
              }}
              type="button"
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="flex justify-center gap-1.5">
          {images.map((_, dot) => (
            <span
              className={cn(
                "size-1.5 rounded-full",
                dot === current ? "bg-[#008069]" : "bg-[#d1d7db]",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: one dot per image position
              key={dot}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
