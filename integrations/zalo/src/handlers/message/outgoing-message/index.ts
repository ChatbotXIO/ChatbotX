import {
  type SendFileStepSchema,
  type SendGifStepSchema,
  type SendImageStepSchema,
  type SendMultipleImagesStepSchema,
  type SendTextStepSchema,
  type StepType,
  stepTypes,
} from "@chatbotx.io/flow-config"
import type {
  MessageHandlers,
  OutgoingContact,
  OutgoingMessage,
  SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { sendMessageToZaloOA, uploadAttachment } from "../../../api/message"
import { mapToChannelError } from "../../../lib/error-mapper"
import { logger } from "../../../lib/logger"
import type { ZaloAuthValue } from "../../../schema/definition"
import type {
  MessageTemplate,
  ZaloSendMessageRequest,
} from "../../../schema/webhook"
import { convertFlowStepFile } from "./send-file"
import {
  convertFlowStepImage,
  convertFlowStepMultipleImages,
} from "./send-image"
import { convertFlowStepText } from "./send-text"

export const handledFlowStepTypes = [
  stepTypes.enum.sendText,
  stepTypes.enum.sendImage,
  stepTypes.enum.sendGif,
  stepTypes.enum.sendMultipleImages,
  stepTypes.enum.sendFile,
] as const satisfies readonly StepType[]

export const sendMessage: MessageHandlers<ZaloAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props
    const messageIds: string[] = []
    let sentCount = 0
    try {
      for await (const zaloMessage of convertMessageToZaloMessage(
        ctx.auth,
        message,
      )) {
        const payload = buildMessagePayload(contact, zaloMessage)
        const response = await sendMessageToZaloOA(ctx.auth, payload)
        sentCount += 1
        if (response.data?.message_id) {
          messageIds.push(response.data.message_id)
        }
        logger.info(`Message sent for Zalo OA UID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    // Returning the provider ids lets the worker backfill the row's sourceId,
    // so the oa_send_* webhook echo dedups instead of inserting a duplicate.
    return {
      messageIds,
      sentCount,
    }
  }

export async function* convertMessageToZaloMessage(
  auth: ZaloAuthValue,
  message: OutgoingMessage,
): AsyncGenerator<MessageTemplate> {
  const attachments = message.attachments ?? []
  if (!message.text && attachments.length === 0) {
    throw new Error("Unsupported message type or missing content")
  }

  // Every attachment is uploaded before anything is sent: a bad file then
  // fails the whole send up front, so a retry never re-sends the text.
  const attachmentMessages: MessageTemplate[] = []
  for (const attachment of attachments) {
    attachmentMessages.push(await uploadZaloAttachment(auth, attachment))
  }

  // Zalo carries text and media in separate messages, so a reply with both
  // goes out as the text first, then one message per attachment.
  if (message.text) {
    yield {
      text: message.text,
    }
  }
  yield* attachmentMessages
}

const uploadZaloAttachment = async (
  auth: ZaloAuthValue,
  attachment: NonNullable<OutgoingMessage["attachments"]>[number],
): Promise<MessageTemplate> => {
  if (attachment.fileType === "image") {
    const {
      data: { attachment_id },
    } = await uploadAttachment(auth, "image", attachment.url as string)
    return {
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
  }
  if (attachment.fileType === "file") {
    const {
      data: { token },
    } = await uploadAttachment(auth, "file", attachment.url as string)
    return {
      attachment: {
        type: "file",
        payload: {
          token: token as string,
        },
      },
    }
  }
  throw new Error(`Unsupported attachment type: ${attachment.fileType}`)
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
  props: Parameters<MessageHandlers<ZaloAuthValue>["sendFlowStep"]>[0],
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
    case stepTypes.enum.sendMultipleImages:
      yield* convertFlowStepMultipleImages(
        props as SendFlowStepProps<ZaloAuthValue, SendMultipleImagesStepSchema>,
      )
      break
    case stepTypes.enum.sendFile:
      yield* await convertFlowStepFile(
        props as SendFlowStepProps<ZaloAuthValue, SendFileStepSchema>,
      )
      break
    default:
      throw new Error(`Unsupported Zalo flow step: ${step.stepType}`)
  }
}

export const sendFlowStep: MessageHandlers<ZaloAuthValue>["sendFlowStep"] =
  async (props) => {
    const {
      ctx,
      data: { contact },
    } = props
    const messageIds: string[] = []
    let sentCount = 0
    try {
      for await (const zaloMessage of convertFlowStepToZaloMessage(props)) {
        const response = await sendMessageToZaloOA(
          ctx.auth,
          buildMessagePayload(contact, zaloMessage),
        )
        sentCount += 1
        if (response.data?.message_id) {
          messageIds.push(response.data.message_id)
        }
        logger.info(`Message sent for ID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
      throw mapToChannelError(error)
    }

    return {
      messageIds,
      sentCount,
    }
  }
