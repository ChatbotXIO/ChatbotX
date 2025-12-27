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
import {
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageRequest,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../schemas"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepQuickReply } from "./send-quick-reply"
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
  if (message.contentType === ContentType.text) {
    if (message.content) {
      yield {
        text: message.content,
      }
    }
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case FileType.image:
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "image",
            ),
          }
          continue
        case FileType.video:
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "video",
            ),
          }
          continue
        case FileType.audio:
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
  messagingType: "MESSAGE_TAG" | "RESPONSE" = "MESSAGE_TAG",
): FacebookSendMessageRequest => {
  const recipientId = conversation.contact?.sourceId

  if (!recipientId) {
    throw new Error("Missing recipient ID in conversation")
  }

  return {
    recipient: { id: recipientId },
    message: {
      ...message,
      metadata: MESSENGER_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag: messagingType === "MESSAGE_TAG" ? "ACCOUNT_UPDATE" : undefined,
  }
}

export async function* convertFlowStepToFacebookMessage(
  auth: MessengerAuthValue,
  flowVersionId: string,
  step: SendFlowStepData,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  switch (step.stepType) {
    case StepType.sendText:
      yield* convertFlowStepText(flowVersionId, step) as Generator<
        FacebookMessageAttachmentPayload | FacebookMessage
      >
      break
    case StepType.sendImage:
    case StepType.sendVideo:
      await (yield* convertFlowStepMedia(auth, flowVersionId, step))
      break
    case StepType.sendAudio:
    case StepType.sendFile:
      await (yield* convertFlowStepFile(auth, step))
      break
    case StepType.sendGif:
      yield* convertFlowStepGif(step.url) as Generator<FacebookMessage>
      break
    case StepType.sendQuickReply:
      yield* convertFlowStepQuickReply(
        flowVersionId,
        step,
      ) as Generator<FacebookMessage>
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
        buildMessagePayload(
          conversation,
          facebookMessage,
          step.stepType === StepType.sendQuickReply
            ? "RESPONSE"
            : "MESSAGE_TAG",
        ),
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
