import type { IAuth, IContact } from "@ahachat.ai/sdk"
import type { ILogObj, Logger } from "tslog"
import { WhatsAppAPI } from "whatsapp-api-js"
import type { Text } from "whatsapp-api-js/messages"
import type {
  ServerErrorResponse,
  ServerSentMessageResponse,
} from "whatsapp-api-js/types"
import { getAccessToken } from "./auth"

export type OutgoingMesasge = Text

export type SendMessageProps = {
  message: OutgoingMesasge
  logger: Logger<ILogObj>
  contact: IContact
  auth: IAuth
}

export const send = async ({
  message,
  contact,
  auth,
  logger,
}: SendMessageProps) => {
  const accessToken = await getAccessToken(auth)

  const whatsappLogger = logger.getSubLogger({ name: "whatsapp" })
  const whatsappApi = new WhatsAppAPI({
    token: accessToken,
    secure: false,
  })

  try {
    const sendResponse = await whatsappApi.sendMessage(
      auth.metadata.botPhoneId,
      contact.phoneNumber,
      message,
    )
    const serverError = sendResponse as ServerErrorResponse

    if (serverError?.error) {
      whatsappLogger.error(
        `Failed to send message of type ${message._type}`,
        serverError.error,
      )
      return
    }

    const messageId = (sendResponse as ServerSentMessageResponse)?.messages?.[0]
      ?.id
    if (messageId) {
      whatsappLogger.info("Message sent successfully", {
        messageId,
        messageType: message._type,
      })
    } else {
      whatsappLogger.warn(
        `Message of type ${message._type} could not be sent`,
        sendResponse,
      )
    }
  } catch (error) {
    whatsappLogger.error("An error occurred while sending the message", error)
  }
}
