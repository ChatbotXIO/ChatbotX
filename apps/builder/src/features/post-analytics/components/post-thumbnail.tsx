"use client"

import { ImageIcon } from "lucide-react"
import { useState } from "react"

/** Fixed-size post thumbnail that falls back to a neutral icon when the image is missing or fails. */
export const PostThumbnail = ({ src }: { src: string | null }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && failedSrc !== src
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground sm:size-12">
      {showImage ? (
        // biome-ignore lint/performance/noImgElement: external platform thumbnail
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load-failure handler, not user interaction
        <img
          alt=""
          className="size-full object-cover"
          height={48}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          referrerPolicy="no-referrer"
          src={src ?? undefined}
          width={48}
        />
      ) : (
        <ImageIcon aria-hidden="true" className="size-5" />
      )}
    </div>
  )
}
