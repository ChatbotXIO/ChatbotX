import type { CSSProperties } from "react"

/** The tallest a portrait video grows: a phone-shaped video must not fill the page. */
const PORTRAIT_MAX_HEIGHT = "min(70vh, 640px)"

export type EmbeddedVideoBox = {
  className: string
  style: CSSProperties
}

/**
 * The frame a video plays in. The box is sized from the ratio alone, so the
 * page does not shift while the player loads. Landscape matches the cover
 * image it replaces; portrait is centered, capped in height, and never wider
 * than its container.
 */
export const getEmbeddedVideoBox = (aspectRatio: number): EmbeddedVideoBox =>
  aspectRatio >= 1
    ? {
        className: "w-full max-w-3xl overflow-hidden rounded-xl bg-muted",
        style: { aspectRatio },
      }
    : {
        className: "mx-auto overflow-hidden rounded-xl bg-muted",
        style: {
          aspectRatio,
          width: `min(100%, calc(${PORTRAIT_MAX_HEIGHT} * ${aspectRatio}))`,
        },
      }
