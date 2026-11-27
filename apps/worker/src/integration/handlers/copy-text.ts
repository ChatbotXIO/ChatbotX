import {
  type CopyTextStepSchema,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

export type CopyTextReplyProps = ExecuteStepProps<CopyTextStepSchema>

/**
 * The message a contact gets when they tap a Copy Text button that was sent as
 * a reply — on a channel that cannot copy, or when the text did not fit the
 * channel's copy control: the tap answers with the text, which the contact can
 * long-press to copy. A native copy never gets here — it happens on the device
 * and the bot is not told.
 *
 * The text is resolved again from the authored expression, in the same context
 * as send time. `null` (nothing to send) when it resolves to nothing.
 */
export async function resolveCopyTextReply(
  props: CopyTextReplyProps,
): Promise<SendTextStepSchema | null> {
  const {
    conversation,
    contactInbox,
    step,
    targetNodeId,
    appointmentId,
    sentByUserId,
  } = props

  const resolvedText = await resolveContactVariablesDeep(
    conversation.contactId,
    step.text,
    {
      contactInbox,
      conversation,
      ...(appointmentId ? { appointmentId } : {}),
      ...(sentByUserId ? { sentByUserId } : {}),
    },
  )
  const text = resolvedText.trim()
  if (!text) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        stepId: step.id,
      },
      "Not replying to a Copy Text tap: the text resolved to nothing",
    )
    return null
  }

  return {
    id: step.id,
    ...(targetNodeId ? { nodeId: targetNodeId } : {}),
    stepType: stepTypes.enum.sendText,
    text,
    buttons: [],
  }
}
