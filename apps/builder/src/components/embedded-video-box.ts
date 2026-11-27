import type { CSSProperties } from "react"

/** The tallest a portrait video grows: a phone-shaped video must not fill the page. */
const PORTRAIT_MAX_HEIGHT = "min(70vh, 640px)"

/** The cover frame's ratio (`aspect-video`): the shape a form preview fits a video into. */
const FRAME_ASPECT_RATIO = 16 / 9

/**
 * Where the box lives: `page` is a public page (sized from the width it has);
 * `frame` is inside a fixed-size, flex-centered frame that it must fit without
 * growing.
 */
export type EmbeddedVideoFit = "page" | "frame"

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
export const getEmbeddedVideoBox = (
  aspectRatio: number,
  fit: EmbeddedVideoFit = "page",
): EmbeddedVideoBox => {
  if (fit === "frame") {
    // Wider than the frame: fill its width; otherwise fill its height.
    return {
      className:
        aspectRatio >= FRAME_ASPECT_RATIO
          ? "w-full overflow-hidden bg-muted"
          : "h-full overflow-hidden bg-muted",
      style: { aspectRatio },
    }
  }
  return aspectRatio >= 1
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
}
