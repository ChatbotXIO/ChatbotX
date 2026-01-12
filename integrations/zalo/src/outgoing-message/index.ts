import { StepType } from "@aha.chat/flow-config"
import {
  type Context,
  type ConversationEntity,
  FileType,
  type MessageEntity,
  type SendFlowStepData,
} from "@aha.chat/sdk"
import { sendMessage, uploadAttachment } from "../api/message"
import { logger } from "../libs/logger"
import type { ZaloAuthValue } from "../schemas/definition"
import type {
  MessageTemplate,
  ZaloSendMessageRequest,
} from "../schemas/webhook"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepImage } from "./send-image"
import { convertFlowStepText } from "./send-text"

export const sendOutgoingMessage = async (
  ctx: Context<ZaloAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
): Promise<void> => {
  try {
    for await (const zaloMessage of convertMessageToZaloMessage(
      ctx.auth,
      message,
    )) {
      const payload = buildMessagePayload(conversation, zaloMessage)
      await sendMessage(ctx.auth, payload)
      logger.info(`Message sent for Zalo UID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(
      "An error occurred while sending the message",
      JSON.stringify(error),
    )
  }
}

export async function* convertMessageToZaloMessage(
  auth: ZaloAuthValue,
  message: MessageEntity,
): AsyncGenerator<MessageTemplate> {
  if (message.content) {
    yield {
      text: message.content,
    }
  } else if (message.attachments) {
    for (const attachment of message.attachments) {
      if (attachment.fileType === FileType.image) {
        const {
          data: { attachment_id },
        } = await uploadAttachment(auth, "image", attachment.url as string)
        yield {
          attachment: {
            type: "template",
            payload: {
              template_type: "media",
              elements: [
                {
                  media_type: "image",
                  attachment_id,
                },
              ],
            },
          },
        }
      } else if (attachment.fileType === FileType.file) {
        const {
          data: { token },
        } = await uploadAttachment(auth, "file", attachment.url as string)
        yield {
          attachment: {
            type: "file",
            payload: {
              token: token as string,
            },
          },
        }
      } else {
        throw new Error(`Unsupported attachment type: ${attachment.fileType}`)
      }
    }
  } else {
    throw new Error("Unsupported message type or missing content")
  }
}

const buildMessagePayload = (
  conversation: ConversationEntity,
  message: MessageTemplate,
): ZaloSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId

  if (!recipientId?.trim()) {
    throw new Error("Recipient ID is required and cannot be empty")
  }

  return {
    recipient: { user_id: recipientId },
    message,
  }
}

export async function* convertFlowStepToZaloMessage(
  auth: ZaloAuthValue,
  flowId: string,
  flowVersionId: string,
  step: SendFlowStepData,
): AsyncGenerator<MessageTemplate> {
  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(flowId, flowVersionId, step)
      break
    case StepType.sendImage:
    case StepType.sendGif:
      yield* await convertFlowStepImage(auth, flowId, flowVersionId, step)
      break
    case StepType.sendFile:
      yield* await convertFlowStepFile(auth, step)
      break
    default:
      break
  }
}

export const sendFlowStep = async (
  ctx: Context<ZaloAuthValue>,
  conversation: ConversationEntity,
  flowId: string,
  flowVersionId: string,
  step: SendFlowStepData,
) => {
  try {
    for await (const zaloMessage of convertFlowStepToZaloMessage(
      ctx.auth,
      flowId,
      flowVersionId,
      step,
    )) {
      await sendMessage(
        ctx.auth,
        buildMessagePayload(conversation, zaloMessage),
      )
      logger.info(`Message sent for ID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(
      "An error occurred while sending the message",
      JSON.stringify(error),
    )
  }
}
