import {
  type CallPhoneNumberStepSchema,
  normalizeDialablePhoneNumber,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import { logger } from "../../lib/logger"
import type { ExecuteStepProps } from "./flow"

export type CallPhoneNumberReplyProps =
  ExecuteStepProps<CallPhoneNumberStepSchema>

/**
 * The message a contact gets when they tap a Call Phone Number button on a
 * channel that cannot dial: the button was sent as a reply, so the tap answers
 * with the number as text the contact can long-press to call. Native channels
 * never get here — the call happens on the device and the bot is not told.
 *
 * The number is resolved again from the authored expression, in the same
 * context as send time. `null` (nothing to send) when it is not a valid
 * international number.
 */
export async function resolveCallPhoneNumberReply(
  props: CallPhoneNumberReplyProps,
): Promise<SendTextStepSchema | null> {
  const {
    conversation,
    contactInbox,
    step,
    targetNodeId,
    appointmentId,
    sentByUserId,
  } = props

  const resolvedNumber = await resolveContactVariablesDeep(
    conversation.contactId,
    step.phoneNumber,
    {
      contactInbox,
      conversation,
      ...(appointmentId ? { appointmentId } : {}),
      ...(sentByUserId ? { sentByUserId } : {}),
    },
  )
  const phoneNumber = normalizeDialablePhoneNumber(resolvedNumber)
  if (!phoneNumber) {
    logger.warn(
      {
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        stepId: step.id,
      },
      "Not replying to a Call Phone Number tap: the number is not a valid international number",
    )
    return null
  }

  return {
    id: step.id,
    ...(targetNodeId ? { nodeId: targetNodeId } : {}),
    stepType: stepTypes.enum.sendText,
    text: phoneNumber,
    buttons: [],
  }
}
