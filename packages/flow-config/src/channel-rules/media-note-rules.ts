import { type ChannelType, channelTypes } from "@chatbotx.io/utils/channel"
import type { z } from "zod"
import { stepTypes } from "../steps/step-action"
import { flowValidationCodes } from "../validation-codes"
import { CHANNEL_FLOW_POLICIES, type MediaNoteStepType } from "./policies"

/** Whether the channel sends this media step as a note when `asNote` is set. */
export const canSendMediaNote = (
  channel: string | null | undefined,
  stepType: string,
): boolean => {
  const parsed = channelTypes.safeParse(channel)

  return (
    parsed.success &&
    (
      CHANNEL_FLOW_POLICIES[parsed.data].mediaNotes as readonly string[]
    ).includes(stepType)
  )
}

export const refineMediaNoteForChannel =
  (channel: ChannelType, stepType: MediaNoteStepType) =>
  (
    step: { asNote?: boolean; caption?: string },
    ctx: z.RefinementCtx,
  ): void => {
    if (!step.asNote) {
      return
    }

    if (!canSendMediaNote(channel, stepType)) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaNoteUnsupported,
        path: ["asNote"],
      })
      return
    }

    // A round video carries no caption.
    if (stepType === stepTypes.enum.sendVideo && step.caption) {
      ctx.addIssue({
        code: "custom",
        message: flowValidationCodes.mediaNoteCaptionUnsupported,
        path: ["caption"],
      })
    }
  }
