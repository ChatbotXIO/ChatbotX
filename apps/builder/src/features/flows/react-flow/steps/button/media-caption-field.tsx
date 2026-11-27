"use client"

import { resolveMediaCaptionLimit } from "@chatbotx.io/flow-config"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { TiptapEditorField } from "@/components/tiptap/tiptap-editor-field"
import { FlowValidationFieldError } from "../../flow-validation-field-error"

type MediaCaptionFieldProps = {
  /** Form path of the step, e.g. `steps.0`. */
  parentName: string
}

/**
 * The caption of an image or video step, shown only on a channel whose policy
 * declares `limits.mediaCaption` and not on a round video (the same rules
 * publish applies). A caption left over from another channel stays visible so
 * the author can remove it instead of meeting a publish error on a field they
 * cannot see.
 */
export const MediaCaptionField = ({ parentName }: MediaCaptionFieldProps) => {
  const t = useTranslations()
  const channel = useWatch({ name: "beforeStep.channel" })
  const caption = useWatch({ name: `${parentName}.caption` })
  const asNote = useWatch({ name: `${parentName}.asNote` })
  const limit = resolveMediaCaptionLimit(channel)

  // A round video carries no caption.
  if ((limit === undefined || asNote) && !caption) {
    return null
  }

  return (
    <div className="space-y-1 pt-2" data-slot="media-caption-field">
      <TiptapEditorField
        hideMessage
        includeBotFieldVariables
        includeCouponVariables
        includePipelineVariables
        includePostCommentVariables
        label={t("flows.media.captionLabel")}
        maxLength={limit}
        name={`${parentName}.caption`}
        placeholder={t("flows.media.captionPlaceholder")}
        required={false}
      />
      <FlowValidationFieldError name={`${parentName}.caption`} />
    </div>
  )
}
