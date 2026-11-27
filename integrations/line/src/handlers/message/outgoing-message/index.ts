import { type StepType, stepTypes } from "@chatbotx.io/flow-config"
import {
  contentTypes,
  type MessageHandlers,
  type SendFlowStepData,
} from "@chatbotx.io/sdk"
import { toChannelErrorUnlessAuth } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { LineAuthValue } from "../../../schema"
import { dispatchLineMessages, type LineMessage } from "./dispatch"
import {
  attachmentMessages,
  convertFlowStepGif,
  convertFlowStepMedia,
  convertFlowStepMultipleImages,
} from "./send-attachment"
import { convertFlowStepCard, convertFlowStepCarousel } from "./send-card"
import {
  convertFlowStepQuickReply,
  toQuickReplyActions,
  withQuickReplies,
} from "./send-quick-reply"
import { convertFlowStepText, textMessages } from "./send-text"

/** Telegram's list plus `sendCard`, which LINE renders as a flex bubble. */
export const handledFlowStepTypes = [
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendVideo,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendAudio,
  stepTypes.enum.sendFile,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendQuickReply,
  stepTypes.enum.sendCard,
  stepTypes.enum.sendCarousel,
] as const satisfies readonly StepType[]

/** A flow step as LINE message objects (pure; see the converters). */
export function convertFlowStep(
  step: SendFlowStepData,
  flowId: string,
): LineMessage[] {
  switch (step.stepType) {
    case stepTypes.enum.sendText:
      return convertFlowStepText(step, flowId)
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendVideo:
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      return convertFlowStepMedia(step, flowId)
    case stepTypes.enum.sendMultipleImages:
      return convertFlowStepMultipleImages(step)
    case stepTypes.enum.sendGif:
      return convertFlowStepGif(step)
    case stepTypes.enum.sendQuickReply:
      return convertFlowStepQuickReply(step, flowId)
    case stepTypes.enum.sendCard:
      return convertFlowStepCard(step, flowId)
    case stepTypes.enum.sendCarousel:
      return convertFlowStepCarousel(step, flowId)
    default:
      throw new Error(`Unsupported LINE flow step: ${step.stepType}`)
  }
}

/**
 * No send checkpoint: the worker's `sendFlowStep` records a failed step and
 * completes its job instead of retrying it, so nothing would ever resume one.
 */
export const sendFlowStep: MessageHandlers<LineAuthValue>["sendFlowStep"] =
  async ({ ctx, data }) => {
    try {
      const messages = withQuickReplies(
        convertFlowStep(data.step, data.flowId),
        toQuickReplyActions(data.quickReplies ?? []),
      )
      return await dispatchLineMessages(ctx, data.contact.sourceId, messages)
    } catch (error) {
      logger.error({ err: error }, "LINE flow step send failed")
      throw toChannelErrorUnlessAuth(error)
    }
  }

/** Checkpointed by the `Message` id, which the chat queue's retry reuses. */
export const sendMessage: MessageHandlers<LineAuthValue>["sendMessage"] =
  async ({ ctx, data: { contact, message, quickReplies } }) => {
    const messages: LineMessage[] = message.text
      ? textMessages(message.text)
      : []
    if (message.contentType === contentTypes.enum.text) {
      messages.push(...(message.attachments ?? []).flatMap(attachmentMessages))
    }

    try {
      return await dispatchLineMessages(
        ctx,
        contact.sourceId,
        withQuickReplies(messages, toQuickReplyActions(quickReplies ?? [])),
        message.id,
      )
    } catch (error) {
      logger.error({ err: error }, "LINE message send failed")
      throw toChannelErrorUnlessAuth(error)
    }
  }
