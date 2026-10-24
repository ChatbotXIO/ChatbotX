"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useEffect, useRef, useState } from "react"
import { ShopImage } from "./shop-image"

/** RTL pages scroll to negative `scrollLeft`. */
const scrollDirection = (element: HTMLElement) =>
  getComputedStyle(element).direction === "rtl" ? -1 : 1

/**
 * A product's images, one at a time, like the mini app carousel: swiped
 * (native scroll snapping), with dots for where it is. One image (or none)
 * is just that image. `index` / `onIndexChange` let thumbnails drive it.
 */
export function ShopImageCarousel({
  images,
  alt,
  size,
  eager = false,
  imageClassName,
  iconClassName,
  index,
  onIndexChange,
}: {
  images: string[]
  alt: string
  size: number
  eager?: boolean
  imageClassName?: string
  iconClassName?: string
  index?: number
  onIndexChange?: (index: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)

  const goTo = (target: number) => {
    const track = trackRef.current
    if (!track) {
      return
    }
    track.scrollTo({
      left: target * track.clientWidth * scrollDirection(track),
      behavior: "smooth",
    })
  }

  // A thumbnail picked outside moves the carousel to it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside change of `index` should scroll
  useEffect(() => {
    if (index !== undefined && index !== current) {
      goTo(index)
    }
  }, [index])

  const onScroll = () => {
    const track = trackRef.current
    if (!track?.clientWidth) {
      return
    }
    const position = Math.round(Math.abs(track.scrollLeft) / track.clientWidth)
    if (position !== current) {
      setCurrent(position)
      onIndexChange?.(position)
    }
  }

  if (images.length <= 1) {
    return (
      <ShopImage
        alt={alt}
        className={imageClassName}
        eager={eager}
        iconClassName={iconClassName}
        size={size}
        src={images[0] ?? null}
      />
    )
  }

  return (
    <div className="relative h-full w-full">
      <div
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={onScroll}
        ref={trackRef}
      >
        {images.map((url, position) => (
          <div
            aria-hidden={position !== current}
            className="h-full w-full shrink-0 snap-center"
            // biome-ignore lint/suspicious/noArrayIndexKey: the same image may be listed twice
            key={`${position}-${url}`}
          >
            <ShopImage
              alt={alt}
              className={imageClassName}
              // Only the first is needed at once; the rest wait for a swipe.
              eager={eager && position === 0}
              iconClassName={iconClassName}
              size={size}
              src={url}
            />
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
        <div className="flex gap-1 rounded-full bg-black/30 px-1.5 py-1 backdrop-blur-sm">
          {images.map((url, dot) => (
            <span
              className={cn(
                "h-1.5 rounded-full bg-white transition-all duration-300",
                dot === current ? "w-3" : "w-1.5 opacity-60",
              )}
              // biome-ignore lint/suspicious/noArrayIndexKey: one dot per image position
              key={`${dot}-${url}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
