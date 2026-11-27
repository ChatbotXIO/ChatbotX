"use client"

import { TextareaField } from "@chatbotx.io/ui/components/form/textarea-field"
import {
  parseEmbeddedVideoSource,
  toEmbeddedVideoView,
} from "@chatbotx.io/utils/embedded-video"
import { useTranslations } from "next-intl"
import { useFormContext, useWatch } from "react-hook-form"
import { EmbeddedVideoPlayer } from "@/components/embedded-video-player"

type VideoFormValues = { video: { source: string } }

/** The video input and, once its text is a supported video, how it will play. */
export function TemplateVideoField() {
  const t = useTranslations()
  const { control } = useFormContext<VideoFormValues>()
  const source = useWatch({ control, name: "video.source" })
  // A preview needs no network: the parser and the player are the ones the
  // public page uses (the ratio is the hint it carries, else 16:9).
  const parsed = source.trim() ? parseEmbeddedVideoSource(source) : null

  return (
    <div className="space-y-3">
      <TextareaField
        description={t("templates.form.videoDescription")}
        label={t("templates.form.video")}
        name="video.source"
        rows={3}
      />
      {parsed?.ok ? (
        <EmbeddedVideoPlayer
          title={t("templates.form.videoPreviewTitle")}
          video={toEmbeddedVideoView(parsed.video)}
        />
      ) : null}
    </div>
  )
}
