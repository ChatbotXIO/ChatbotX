"use client"

import { useFormOptionalLabel } from "@chatbotx.io/ui/components/form/optional-label-context"
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@chatbotx.io/ui/components/ui/form"
import { Textarea } from "@chatbotx.io/ui/components/ui/textarea"
import {
  type EmbeddedVideo,
  type EmbeddedVideoView,
  isSameEmbeddedVideo,
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
  usesOEmbedAspectRatio,
} from "@chatbotx.io/utils/embedded-video"
import { VideoIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { EmbeddedVideoPlayer } from "@/components/embedded-video-player"

type VideoFormValues = { video: { source: string } }

type TemplateVideoFieldProps = {
  /** The video as stored; a typed link to the same video keeps its stored ratio. */
  savedVideo?: EmbeddedVideo | null
}

type VideoPreview = {
  view: EmbeddedVideoView
  /** The ratio is not known yet: the server reads it when the template is saved. */
  isOrientationPending: boolean
}

/**
 * What the preview plays for the typed text, in the order the server resolves
 * the ratio on save: a ratio in the link (embed code, Shorts), else the stored
 * one when it is the same video, else the provider's oEmbed (at save). `null`
 * when the text is empty or not a supported video.
 */
const resolvePreview = (
  source: string,
  savedVideo: EmbeddedVideo | null | undefined,
): VideoPreview | null => {
  const parsed = source.trim() ? parseEmbeddedVideoSource(source) : null
  if (!parsed?.ok) {
    return null
  }
  const { video, hintedAspectRatio } = parsed
  if (hintedAspectRatio !== null) {
    return { view: toEmbeddedVideoView(video), isOrientationPending: false }
  }
  if (savedVideo && isSameEmbeddedVideo(video, savedVideo)) {
    return {
      view: toEmbeddedVideoView(savedVideo),
      isOrientationPending:
        savedVideo.aspectRatio === null &&
        usesOEmbedAspectRatio(savedVideo.provider),
    }
  }
  return {
    view: toEmbeddedVideoView(video),
    isOrientationPending: usesOEmbedAspectRatio(video.provider),
  }
}

/** The video input: a label, a preview frame shaped like the cover image's, then the text. */
export function TemplateVideoField({ savedVideo }: TemplateVideoFieldProps) {
  const t = useTranslations()
  const optionalLabel = useFormOptionalLabel()
  const { control } = useFormContext<VideoFormValues>()
  const source = useWatch({ control, name: "video.source" })
  // A preview needs no network: the parser and the player are the ones the
  // public page uses.
  const preview = resolvePreview(source, savedVideo)

  return (
    <FormField
      control={control}
      name="video.source"
      render={({ field }) => (
        <FormItem className="flex flex-col gap-2">
          <FormLabel className="flex items-center gap-1">
            {t("templates.form.video")}
            <span className="self-start font-normal text-xxs">
              {optionalLabel}
            </span>
          </FormLabel>
          <div
            className="flex aspect-video w-full max-w-md items-center justify-center overflow-hidden rounded-lg border"
            data-testid="template-video-frame"
          >
            {preview ? (
              <EmbeddedVideoPlayer
                fit="frame"
                title={t("templates.form.videoPreviewTitle")}
                video={preview.view}
              />
            ) : (
              <div className="flex flex-col items-center gap-1 px-4 text-center text-muted-foreground">
                <VideoIcon className="size-8" />
                <p className="text-xs">{t("templates.form.videoEmpty")}</p>
              </div>
            )}
          </div>
          {preview?.isOrientationPending ? (
            <p className="text-muted-foreground text-xs">
              {t("templates.form.videoOrientationNote")}
            </p>
          ) : null}
          <FormControl>
            <Textarea className="max-w-md" rows={3} {...field} />
          </FormControl>
          <FormDescription>
            {t("templates.form.videoDescription")}
          </FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
