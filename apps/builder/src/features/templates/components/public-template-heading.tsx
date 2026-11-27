import type { PublicTemplateProjection } from "@chatbotx.io/business"
import type { EmbeddedVideoView } from "@chatbotx.io/utils/embedded-video"
import { EmbeddedVideoPlayer } from "@/components/embedded-video-player"

export type PublicTemplateHeadingTag = "h1" | "h2"

/**
 * The image and name the share page and the install page open with: the
 * cover fills a 16:9 frame, the name sits below it. A template with a video
 * shows the video in the cover's place (for a video file the cover is its
 * poster and its fallback; an iframe player does not use it). The name is the page's h1
 * there; under another page's own h1 (the home page's Templates tab) it is an
 * h2.
 */
export function PublicTemplateHeading({
  template,
  imageUrl,
  video,
  videoTitle,
  headingTag: Heading = "h1",
}: {
  template: Pick<PublicTemplateProjection, "name">
  imageUrl: string
  video?: EmbeddedVideoView | null
  /** Translated accessible name of the video player. */
  videoTitle: string
  headingTag?: PublicTemplateHeadingTag
}) {
  return (
    <div className="flex flex-col gap-4">
      {video ? (
        <EmbeddedVideoPlayer
          coverUrl={imageUrl}
          title={videoTitle}
          video={video}
        />
      ) : (
        // biome-ignore lint/performance/noImgElement: external, unoptimized template thumbnail resolved from publisher-uploaded storage
        <img
          alt={template.name}
          className="aspect-video w-full max-w-3xl rounded-xl bg-muted object-cover object-center"
          height={432}
          src={imageUrl}
          width={768}
        />
      )}
      <Heading className="break-words font-semibold text-2xl tracking-normal">
        {template.name}
      </Heading>
    </div>
  )
}
