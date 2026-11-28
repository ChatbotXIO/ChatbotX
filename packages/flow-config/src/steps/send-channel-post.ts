import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * What a "send a post" message says, without anything specific to a flow step.
 * A flow step extends it; a message sent outside a flow (inbox, public API) is
 * exactly this, so both are resolved and validated by the same rules.
 *
 * Only the ChatbotX post id is stored: how a channel delivers the post (its own
 * post card, or a text with the link) and whether that post can be sent at all
 * is resolved at send time from the channel policy.
 */
export const sendChannelPostContentSchema = z.object({
  channelPostId: z
    .string()
    .describe(
      "Id of the post to send (numeric string). Get it from `channelPostManagement.list` with `shareableOnly=true`. Empty means nothing is picked yet, which a flow cannot be published with.",
    ),
})
export type SendChannelPostContent = z.infer<
  typeof sendChannelPostContentSchema
>

export const sendChannelPostStepSchema = baseStepSchema.extend({
  stepType: z
    .literal(stepTypes.enum.sendChannelPost)
    .describe(
      'Step type discriminator: "sendChannelPost" (sends one of the business\'s own posts).',
    ),
  ...sendChannelPostContentSchema.shape,
})
export type SendChannelPostStepSchema = z.infer<
  typeof sendChannelPostStepSchema
>

export const sendChannelPostStepDefaultFn = (
  props: Partial<SendChannelPostStepSchema> = {},
): SendChannelPostStepSchema => ({
  channelPostId: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.sendChannelPost,
})
