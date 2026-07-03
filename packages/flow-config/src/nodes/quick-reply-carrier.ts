import type { BaseStepSchema } from "../steps/base"
import { stepTypes } from "../steps/step-action"

export function isQuickReplyCarrierStep(
  channel: string | null | undefined,
  step: BaseStepSchema,
) {
  switch (channel) {
    case "messenger":
    case "instagram":
    case "telegram":
      return (
        step.stepType === stepTypes.enum.sendText ||
        step.stepType === stepTypes.enum.sendImage ||
        step.stepType === stepTypes.enum.sendVideo ||
        step.stepType === stepTypes.enum.sendAudio ||
        step.stepType === stepTypes.enum.sendFile ||
        step.stepType === stepTypes.enum.sendGif
      )
    case "whatsapp":
    case "zalo":
      return (
        step.stepType === stepTypes.enum.sendText ||
        step.stepType === stepTypes.enum.sendImage
      )
    default:
      return step.stepType === stepTypes.enum.sendText
  }
}
