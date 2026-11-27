"use client"

import { toEmbeddedVideoAspectRatio } from "@chatbotx.io/utils/embedded-video"
import { useEffect, useRef, useState } from "react"
import { getEmbeddedVideoBox } from "./embedded-video-box"

type EmbeddedVideoFileProps = {
  /** The stored ratio, or the 16:9 default while the real one is unknown. */
  aspectRatio: number
  src: string
  title: string
  coverUrl?: string
}

/**
 * A video file the browser plays itself. A file carries no ratio in its link,
 * so the real one is read from the file once its metadata loads. A file that
 * cannot play shows the cover instead of a broken player.
 */
export function EmbeddedVideoFile({
  aspectRatio,
  src,
  title,
  coverUrl,
}: EmbeddedVideoFileProps) {
  const [measuredRatio, setMeasuredRatio] = useState<number | null>(null)
  const [hasFailed, setHasFailed] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const box = getEmbeddedVideoBox(measuredRatio ?? aspectRatio)

  // The server-rendered <video> can fail or load its metadata before React
  // attaches `onError` / `onLoadedMetadata` (each event fires once and is
  // gone), so read the element's state on mount.
  useEffect(() => {
    const element = videoRef.current
    if (!element) {
      return
    }
    if (element.error) {
      setHasFailed(true)
    } else if (element.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setMeasuredRatio(
        toEmbeddedVideoAspectRatio(element.videoWidth, element.videoHeight),
      )
    }
  }, [])

  return (
    <div className={box.className} style={box.style}>
      {hasFailed ? (
        coverUrl && (
          // biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage
          <img
            alt={title}
            className="h-full w-full object-cover object-center"
            height={432}
            src={coverUrl}
            width={768}
          />
        )
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: publisher-supplied file, there is no caption track to link
        <video
          aria-label={title}
          className="h-full w-full bg-black object-contain"
          controls={true}
          onError={() => setHasFailed(true)}
          onLoadedMetadata={(event) =>
            setMeasuredRatio(
              toEmbeddedVideoAspectRatio(
                event.currentTarget.videoWidth,
                event.currentTarget.videoHeight,
              ),
            )
          }
          playsInline={true}
          poster={coverUrl}
          preload="metadata"
          ref={videoRef}
          src={src}
        />
      )}
    </div>
  )
}
