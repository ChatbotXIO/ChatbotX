"use client"

import { canSendMediaNote, stepTypes } from "@chatbotx.io/flow-config"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Switch } from "@chatbotx.io/ui/components/ui/switch"
import { useTranslations } from "next-intl"
import { useWatch } from "react-hook-form"
import { FlowValidationFieldError } from "../../flow-validation-field-error"

type MediaNoteSwitchProps = {
  /** Form path of the step, e.g. `steps.0`. */
  parentName: string
}

/**
 * Sends an audio step as a voice message, or a video step as a round video,
 * shown only on a channel whose policy lists the step in `mediaNotes` (the
 * same rule publish applies). A switch left on from another channel stays
 * visible so the author can turn it off.
 */
export const MediaNoteSwitch = ({ parentName }: MediaNoteSwitchProps) => {
  const t = useTranslations()
  const channel = useWatch({ name: "beforeStep.channel" })
  const stepType = useWatch({ name: `${parentName}.stepType` })
  const asNote = useWatch({ name: `${parentName}.asNote` })

  if (!(canSendMediaNote(channel, stepType) || asNote)) {
    return null
  }

  const isVideo = stepType === stepTypes.enum.sendVideo

  return (
    <div className="pt-2" data-slot="media-note-switch">
      <FormFieldWrapper
        description={t(
          isVideo ? "flows.media.videoNoteHint" : "flows.media.voiceNoteHint",
        )}
        hideMessage
        label={t(
          isVideo
            ? "flows.media.sendAsVideoNote"
            : "flows.media.sendAsVoiceNote",
        )}
        name={`${parentName}.asNote`}
      >
        {(field) => (
          <Switch
            checked={field.value ?? false}
            onBlur={field.onBlur}
            onCheckedChange={field.onChange}
          />
        )}
      </FormFieldWrapper>
      <FlowValidationFieldError name={`${parentName}.asNote`} />
    </div>
  )
}
