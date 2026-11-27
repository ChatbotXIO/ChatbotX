import type { EmbeddedVideoView } from "@chatbotx.io/utils/embedded-video"
import {
  type EmbeddedVideoFit,
  getEmbeddedVideoBox,
} from "./embedded-video-box"
import { EmbeddedVideoFile } from "./embedded-video-file"

type EmbeddedVideoPlayerProps = {
  video: EmbeddedVideoView
  /** Translated accessible name; the caller owns the copy. */
  title: string
  /** Shown as the poster of a file video, and instead of it when it fails. */
  coverUrl?: string
  /** `frame` fits the video inside a fixed-size frame (the form preview); default is the public page sizing. */
  fit?: EmbeddedVideoFit
}

/**
 * Plays a template's video. Presentational (no hooks, no translations), so it
 * renders on the server for the public pages and inside the client form's
 * preview alike. The iframe `src` is only ever `video.playback.src`, which the
 * server rebuilt from validated fields.
 */
export function EmbeddedVideoPlayer({
  video,
  title,
  coverUrl,
  fit,
}: EmbeddedVideoPlayerProps) {
  const { playback } = video
  if (playback.kind === "file") {
    return (
      <EmbeddedVideoFile
        aspectRatio={video.aspectRatio}
        coverUrl={coverUrl}
        fit={fit}
        key={playback.src}
        src={playback.src}
        title={title}
      />
    )
  }

  const box = getEmbeddedVideoBox(video.aspectRatio, fit)
  return (
    <div className={box.className} style={box.style}>
      <iframe
        allow={playback.allow}
        allowFullScreen={true}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        src={playback.src}
        title={title}
      />
    </div>
  )
}
