import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendChannelPostStepSchema } from "../steps/send-channel-post"
import { flowValidationCodes } from "../validation-codes"
import type { ChannelValidatorMap } from "./channel-validator"

/**
 * The step may be saved with no post picked (a template install strips the id,
 * the editor starts empty), but a flow cannot be published like that: it would
 * fail on every run. The channel's own rules (which posts it can send) depend
 * on the stored post and are checked when the message is built, not here.
 *
 * Kept apart from the step's editor/viewer modules: it is imported by
 * `validators.ts`, which both the builder's publish schema and the worker's
 * import validation reach, so it must stay React-free.
 */
const structuralSchema = sendChannelPostStepSchema.refine(
  (step) => step.channelPostId.trim() !== "",
  {
    message: flowValidationCodes.sendChannelPostPostRequired,
    path: ["channelPostId"],
  },
)

export const sendChannelPostValidator = {
  [channelTypes.enum.omnichannel]: structuralSchema,
} satisfies ChannelValidatorMap
