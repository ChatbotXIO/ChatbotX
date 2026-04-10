import {
  type SendAudioStepSchema,
  type SendCarouselStepSchema,
  type SendFileStepSchema,
  type SendImageStepSchema,
  type SendQuickReplyStepSchema,
  type SendTextStepSchema,
  type SendVideoStepSchema,
  stepTypes,
} from "@chatbotx.io/flow-config"
import {
  contentTypes,
  type MessageHandlers,
  type OutgoingContact,
  type OutgoingMessage,
  type SendFlowStepProps,
} from "@chatbotx.io/sdk"
import { sendPageMessage } from "../../../apis/message"
import { logger } from "../../../lib/logger"
import {
  type FacebookMessage,
  type FacebookMessageAttachmentPayload,
  type FacebookSendMessageRequest,
  MESSENGER_MESSAGE_METADATA,
  type MessengerAuthValue,
} from "../../../schema"
import { getAttachmentTemplate } from "./send-attachment"
import { convertFlowStepCarousel } from "./send-carousel"
import { convertFlowStepFile } from "./send-file"
import { convertFlowStepGif } from "./send-gif"
import { convertFlowStepMedia } from "./send-media"
import { convertFlowStepQuickReply } from "./send-quick-reply"
import { convertFlowStepText } from "./send-text"

export const sendMessage: MessageHandlers<MessengerAuthValue>["sendMessage"] =
  async (props) => {
    const {
      ctx,
      data: { contact, message },
    } = props

    try {
      for (const facebookMessage of convertMessageToFacebookMessage(message)) {
        const payload = buildMessagePayload({
          contact,
          message: facebookMessage,
        })
        await sendPageMessage(ctx.auth, payload)
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
    }

    return {
      messageIds: [],
    }
  }

export const sendFlowStep: MessageHandlers<MessengerAuthValue>["sendFlowStep"] =
  async (props: SendFlowStepProps<MessengerAuthValue>) => {
    const {
      ctx,
      data: { contact, step },
    } = props
    try {
      for await (const facebookMessage of convertFlowStepToFacebookMessage(
        props,
      )) {
        await sendPageMessage(
          ctx.auth,
          buildMessagePayload({
            contact,
            message: facebookMessage,
            messagingType:
              step.stepType === stepTypes.enum.sendQuickReply
                ? "RESPONSE"
                : "MESSAGE_TAG",
          }),
        )
        logger.info(`Message sent for PSID: ${contact.sourceId}`)
      }
    } catch (error) {
      logger.error(error, "An error occurred while sending the message")
    }

    return {
      messageIds: [],
    }
  }

function* convertMessageToFacebookMessage(
  message: OutgoingMessage,
): Generator<FacebookMessage> {
  if (message.contentType === contentTypes.enum.text) {
    if (message.text) {
      yield {
        text: message.text,
      }
    }
    for (const attachment of message.attachments || []) {
      switch (attachment.fileType) {
        case "image":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "image",
            ),
          }
          continue
        case "video":
          yield {
            attachment: getAttachmentTemplate(
              attachment.url as string,
              "video",
            ),
          }
          continue
        case "audio":
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
      text: message.text ?? "not handled yet",
    }
  }
}

const buildMessagePayload = (props: {
  contact: OutgoingContact
  message: FacebookMessageAttachmentPayload | FacebookMessage
  messagingType?: "MESSAGE_TAG" | "RESPONSE"
}): FacebookSendMessageRequest => {
  const { contact, message, messagingType = "MESSAGE_TAG" } = props

  return {
    recipient: { id: contact.sourceId },
    message: {
      ...message,
      metadata: MESSENGER_MESSAGE_METADATA,
    },
    messaging_type: messagingType,
    tag: messagingType === "MESSAGE_TAG" ? "ACCOUNT_UPDATE" : undefined,
  }
}

async function* convertFlowStepToFacebookMessage(
  props: SendFlowStepProps<MessengerAuthValue>,
): AsyncGenerator<FacebookMessageAttachmentPayload | FacebookMessage> {
  const {
    data: { step },
  } = props

  switch (step.stepType) {
    case stepTypes.enum.sendText:
      yield* convertFlowStepText(
        props as SendFlowStepProps<MessengerAuthValue, SendTextStepSchema>,
      ) as Generator<FacebookMessageAttachmentPayload | FacebookMessage>
      break
    case stepTypes.enum.sendImage:
    case stepTypes.enum.sendVideo:
      await (yield* convertFlowStepMedia(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendImageStepSchema | SendVideoStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendAudio:
    case stepTypes.enum.sendFile:
      await (yield* convertFlowStepFile(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendAudioStepSchema | SendFileStepSchema
        >,
      ))
      break
    case stepTypes.enum.sendGif:
      yield* convertFlowStepGif(step.url) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendQuickReply:
      yield* convertFlowStepQuickReply(
        props as SendFlowStepProps<
          MessengerAuthValue,
          SendQuickReplyStepSchema
        >,
      ) as Generator<FacebookMessage>
      break
    case stepTypes.enum.sendCarousel:
      yield* convertFlowStepCarousel(
        props as SendFlowStepProps<MessengerAuthValue, SendCarouselStepSchema>,
      ) as Generator<FacebookMessage>
      break
    default:
      break
  }
}
