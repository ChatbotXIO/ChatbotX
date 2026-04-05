import {
  type SendFileStepSchema,
  type SendGifStepSchema,
  type SendImageStepSchema,
  type SendTextStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type {
  OutgoingContact,
  OutgoingMessage,
  SendFlowStepProps,
  SendMessageProps,
} from "@chatbotx.io/sdk"
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
  props: SendMessageProps<ZaloAuthValue>,
): Promise<void> => {
  const {
    ctx,
    data: { contact, message, contactInbox },
  } = props
  try {
    for await (const zaloMessage of convertMessageToZaloMessage(
      ctx.auth,
      message,
    )) {
      const payload = buildMessagePayload(contact, zaloMessage)
      await sendMessage(ctx.auth, payload)
      logger.info(`Message sent for Zalo OA UID: ${contactInbox.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}

export async function* convertMessageToZaloMessage(
  auth: ZaloAuthValue,
  message: OutgoingMessage,
): AsyncGenerator<MessageTemplate> {
  if (message.text) {
    yield {
      text: message.text,
    }
  } else if (message.attachments) {
    for (const attachment of message.attachments) {
      if (attachment.fileType === "image") {
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
      } else if (attachment.fileType === "file") {
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
  contact: OutgoingContact,
  message: MessageTemplate,
): ZaloSendMessageRequest => {
  const recipientId = contact.sourceId

  if (!recipientId?.trim()) {
    throw new Error("Recipient ID is required and cannot be empty")
  }

  return {
    recipient: { user_id: recipientId },
    message,
  }
}

export async function* convertFlowStepToZaloMessage(
  props: SendFlowStepProps<ZaloAuthValue>,
): AsyncGenerator<MessageTemplate> {
  const {
    data: { step },
  } = props
  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<ZaloAuthValue, SendTextStepSchema>,
      )
      break
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendGif:
      yield* await convertFlowStepImage(
        props as SendFlowStepProps<
          ZaloAuthValue,
          SendImageStepSchema | SendGifStepSchema
        >,
      )
      break
    case stepTypes.enum.sendFile:
      yield* await convertFlowStepFile(
        props as SendFlowStepProps<ZaloAuthValue, SendFileStepSchema>,
      )
      break
    default:
      break
  }
}

export const sendFlowStep = async (props: SendFlowStepProps<ZaloAuthValue>) => {
  const {
    ctx,
    data: { contact, contactInbox },
  } = props
  try {
    for await (const zaloMessage of convertFlowStepToZaloMessage(props)) {
      await sendMessage(ctx.auth, buildMessagePayload(contact, zaloMessage))
      logger.info(`Message sent for ID: ${contactInbox.sourceId}`)
    }
  } catch (error) {
    logger.error(error, "An error occurred while sending the message")
  }
}
