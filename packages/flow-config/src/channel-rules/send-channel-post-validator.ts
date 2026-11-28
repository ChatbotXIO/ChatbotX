import { channelTypes } from "@chatbotx.io/utils/channel"
import { sendChannelPostStepSchema } from "../steps/send-channel-post"
import { isWithinSignedBigintRange } from "../util"
import { flowValidationCodes } from "../validation-codes"
import type { ChannelValidatorMap } from "./channel-validator"

/**
 * The step may be saved with no post picked (a template install strips the id,
 * the editor starts empty), but a flow cannot be published like that: it would
 * fail on every run. A picked id must be a positive numeric bigint string (ids start at 1, so "0" and "000" are refused), so a
 * malformed or overflowing value cannot reach a `::bigint` cast at send time. The channel's own rules (which posts it can send) depend
 * on the stored post and are checked when the message is built, not here.
 *
 * Kept apart from the step's editor/viewer modules: it is imported by
 * `validators.ts`, which both the builder's publish schema and the worker's
 * import validation reach, so it must stay React-free.
 */
const POST_ID_REGEX = /^(?!0+$)\d{1,19}$/

const isPublishablePostId = (value: string): boolean =>
  POST_ID_REGEX.test(value) && isWithinSignedBigintRange(value)

const structuralSchema = sendChannelPostStepSchema.refine(
  (step) => isPublishablePostId(step.channelPostId),
  {
    message: flowValidationCodes.sendChannelPostPostRequired,
    path: ["channelPostId"],
  },
)

export const sendChannelPostValidator = {
  [channelTypes.enum.omnichannel]: structuralSchema,
} satisfies ChannelValidatorMap
