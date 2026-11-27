"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { ComposerMedia } from "../lib/composer-state"
import { type PreviewMediaLayout, stepSlide } from "../lib/preview-media-layout"

const formatDuration = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(whole / 60)
  return `${minutes}:${String(whole % 60).padStart(2, "0")}`
}

/** One file as a filled tile: the picture, or a video's first frame with a play mark. */
const MediaTile = ({
  className,
  index,
  media,
}: {
  className?: string
  index: number
  media: ComposerMedia
}) => {
  const t = useTranslations()
  const [duration, setDuration] = useState<number | null>(null)
  const alt = t("composer.previewMediaAlt", { index: index + 1 })

  return (
    <div
      className={cn("relative size-full overflow-hidden bg-muted", className)}
    >
      {media.kind === "video" ? (
        <>
          <video
            aria-label={alt}
            className="size-full object-cover"
            muted
            onLoadedMetadata={(event) =>
              setDuration(
                Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : null,
              )
            }
            playsInline
            preload="metadata"
            src={media.url}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-black/55 text-white">
              <PlayIcon aria-hidden="true" className="size-5 fill-current" />
            </span>
          </span>
          {duration === null ? null : (
            <span className="absolute right-1.5 bottom-1.5 rounded bg-black/65 px-1 text-[10px] text-white tabular-nums">
              {formatDuration(duration)}
            </span>
          )}
        </>
      ) : (
        // biome-ignore lint/performance/noImgElement: workspace media thumbnail
        <img
          alt={alt}
          className="size-full object-cover"
          height={640}
          src={media.url}
          width={640}
        />
      )}
    </div>
  )
}

const Frame = ({
  children,
  className,
}: {
  children: React.ReactNode
  className: string
}) => (
  <div className={cn("overflow-hidden rounded-md", className)}>{children}</div>
)

const GRID_CELLS: Record<"pair" | "triple" | "grid", string[]> = {
  grid: ["", "", "", ""],
  pair: ["", ""],
  triple: ["row-span-2", "", ""],
}

const FacebookGrid = ({
  kind,
  layout,
  media,
}: {
  kind: "pair" | "triple" | "grid"
  layout: PreviewMediaLayout
  media: ComposerMedia[]
}) => {
  const t = useTranslations()
  const cells = GRID_CELLS[kind]
  return (
    <Frame
      className={cn(
        "grid gap-0.5",
        kind === "pair"
          ? "aspect-2/1 grid-cols-2"
          : "aspect-square grid-cols-2",
        kind === "triple" && "grid-rows-2",
        kind === "grid" && "grid-rows-2",
      )}
    >
      {cells.map((cellClass, index) => {
        const file = media[index]
        if (!file) {
          return null
        }
        const isLast = index === cells.length - 1
        return (
          <div
            className={cn("relative h-full min-h-0", cellClass)}
            key={file.url}
          >
            <MediaTile index={index} media={file} />
            {kind === "grid" && isLast && layout.overflowCount > 0 ? (
              <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-semibold text-white text-xl">
                {t("composer.previewMoreMedia", {
                  count: layout.overflowCount,
                })}
              </span>
            ) : null}
          </div>
        )
      })}
    </Frame>
  )
}

const Carousel = ({ media }: { media: ComposerMedia[] }) => {
  const t = useTranslations()
  const [current, setCurrent] = useState(0)
  const total = media.length
  const index = Math.min(current, total - 1)
  const file = media[index]
  if (!file) {
    return null
  }
  const go = (step: number) => setCurrent(stepSlide(index, step, total))
  const arrow =
    "absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"

  return (
    // biome-ignore lint/a11y/useSemanticElements: a carousel region, not a fieldset
    <div
      aria-label={t("composer.previewSlideLabel", {
        current: index + 1,
        total,
      })}
      aria-roledescription="carousel"
      role="group"
    >
      <Frame className="relative aspect-square">
        <MediaTile index={index} key={file.url} media={file} />
        {total > 1 ? (
          <>
            <button
              aria-label={t("composer.previewPrevious")}
              className={cn(arrow, "left-1.5")}
              onClick={() => go(-1)}
              type="button"
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
            </button>
            <button
              aria-label={t("composer.previewNext")}
              className={cn(arrow, "right-1.5")}
              onClick={() => go(1)}
              type="button"
            >
              <ChevronRightIcon aria-hidden="true" className="size-4" />
            </button>
          </>
        ) : null}
      </Frame>
      {total > 1 ? (
        <div aria-hidden="true" className="mt-1.5 flex justify-center gap-1">
          {media.map((item, dot) => (
            <span
              className={cn(
                "size-1.5 rounded-full",
                dot === index ? "bg-primary" : "bg-muted-foreground/30",
              )}
              key={item.url}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The attached files laid out the way the previewed network's feed shows them. */
export const PreviewMedia = ({
  isSquare,
  layout,
  media,
}: {
  /** A single file is cropped square (Instagram) instead of landscape. */
  isSquare: boolean
  layout: PreviewMediaLayout
  media: ComposerMedia[]
}) => {
  const first = media[0]
  if (!first || layout.kind === "none") {
    return null
  }
  switch (layout.kind) {
    case "single":
      return (
        <Frame className={isSquare ? "aspect-square" : "aspect-4/3"}>
          <MediaTile index={0} media={first} />
        </Frame>
      )
    case "vertical":
      return (
        <Frame className="mx-auto aspect-9/16 max-h-96">
          <MediaTile index={0} media={first} />
        </Frame>
      )
    case "pair":
    case "triple":
    case "grid":
      return <FacebookGrid kind={layout.kind} layout={layout} media={media} />
    case "carousel":
      return <Carousel media={media} />
    case "strip":
      return (
        <ul className="flex snap-x gap-2 overflow-x-auto pb-1">
          {media.map((file, index) => (
            <li
              className="aspect-4/5 h-44 shrink-0 snap-start overflow-hidden rounded-md"
              key={file.url}
            >
              <MediaTile index={index} media={file} />
            </li>
          ))}
        </ul>
      )
    default:
      return null
  }
}
