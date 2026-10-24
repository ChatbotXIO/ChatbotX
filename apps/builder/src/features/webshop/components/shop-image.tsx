"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ImageIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * A merchant image that pulses while it loads and fades in once it has. An
 * image the browser already had (or loaded before hydration) shows at once.
 */
export function ShopImage({
  src,
  alt,
  size,
  className,
  iconClassName,
  eager = false,
}: {
  src: string | null
  alt: string
  /** The width and height hints, in pixels. */
  size: number
  className?: string
  iconClassName?: string
  eager?: boolean
}) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const image = imageRef.current
    if (!(src && image)) {
      return
    }
    const show = () => setLoaded(true)
    const fail = () => setFailed(true)
    setFailed(false)
    // `complete` with no width means it already failed before hydration.
    setLoaded(image.complete && image.naturalWidth > 0)
    if (image.complete && image.naturalWidth === 0) {
      fail()
    }
    image.addEventListener("load", show)
    image.addEventListener("error", fail)
    return () => {
      image.removeEventListener("load", show)
      image.removeEventListener("error", fail)
    }
  }, [src])

  // A broken image shows the same placeholder as a product without one.
  if (!src || failed) {
    return (
      <div
        className={cn(
          "flex h-full w-full items-center justify-center bg-muted text-muted-foreground/60",
          className,
        )}
      >
        <ImageIcon className={cn("size-8", iconClassName)} />
      </div>
    )
  }
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden bg-muted",
        !loaded && "animate-pulse",
      )}
    >
      {/* biome-ignore lint/performance/noImgElement: merchant images come from any host */}
      <img
        alt={alt}
        className={cn(
          "h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
        height={size}
        loading={eager ? "eager" : "lazy"}
        ref={imageRef}
        src={src}
        width={size}
      />
    </div>
  )
}
