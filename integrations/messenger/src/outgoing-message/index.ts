import { StepType } from "@aha.chat/flow-config"
import {
  ContentType,
  type Context,
  type ConversationEntity,
  FileType,
  type MessageEntity,
  type SendFlowStepData,
} from "@aha.chat/sdk"
import { sendMessage } from "../apis/page"
import { logger } from "../lib/logger"
import type {
  FacebookMessage,
  FacebookMessageAttachmentPayload,
  FacebookSendMessageRequest,
  MessengerAuthValue,
} from "../schemas"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepText } from "./send-text"

export const sendOutgoingMessage = async (
  ctx: Context<MessengerAuthValue>,
  conversation: ConversationEntity,
  message: MessageEntity,
): Promise<void> => {
  try {
    for (const facebookMessage of convertMessageToFacebookMessage(message)) {
      const payload = buildMessagePayload(conversation, facebookMessage)
      await sendMessage(ctx.auth, payload)
      logger.info(`Message sent for PSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(
      "An error occurred while sending the message",
      JSON.stringify(error),
    )
  }
}

export function* convertMessageToFacebookMessage(
  message: MessageEntity,
): Generator<FacebookMessage> {
  if (message.contentType === ContentType.TEXT) {
    if (message.content) {
      yield {
        text: message.content,
      }
    }
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case FileType.IMAGE:
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "image",
            ),
          }
          continue
        case FileType.VIDEO:
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "video",
            ),
          }
          continue
        case FileType.AUDIO:
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "audio",
            ),
          }
          continue
        default:
          yield {
            attachment: getAttachmentTemplate(attachment.url as string, "file"),
          }
          continue
      }
    }
  } else {
    yield {
      text: message.content ?? "not handled yet",
    }
  }
}

const buildMessagePayload = (
  conversation: ConversationEntity,
  message: FacebookMessageAttachmentPayload | FacebookMessage,
): FacebookSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  return {
    recipient: { id: recipientId },
    message,
    messaging_type: "MESSAGE_TAG",
    tag: "ACCOUNT_UPDATE",
  }
}

export async function* convertFlowStepToFacebookMessage(
  auth: MessengerAuthValue,
  flowVersionId: string,
  step: SendFlowStepData,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  switch (step.stepType) {
    case StepType.SEND_TEXT:
      yield* convertFlowStepText(flowVersionId, step) as Generator<
        FacebookMessageAttachmentPayload | FacebookMessage
      >
      break
    case StepType.SEND_IMAGE:
    case StepType.SEND_VIDEO:
      await (yield* convertFlowStepMedia(auth, flowVersionId, step))
      break
    case StepType.SEND_AUDIO:
    case StepType.SEND_FILE:
      await (yield* convertFlowStepFile(auth, step))
      break
    default:
      break
  }
}

export const sendFlowStep = async (
  ctx: Context<MessengerAuthValue>,
  conversation: ConversationEntity,
  flowVersionId: string,
  step: SendFlowStepData,
) => {
  try {
    for await (const facebookMessage of convertFlowStepToFacebookMessage(
      ctx.auth,
      flowVersionId,
      step,
    )) {
      await sendMessage(
        ctx.auth,
        buildMessagePayload(conversation, facebookMessage),
      )
      logger.info(`Message sent for PSID: ${conversation.sourceId}`)
    }
  } catch (error) {
    logger.error(
      "An error occurred while sending the message",
      JSON.stringify(error),
    )
  }
}
