import type { FileType } from "@aha.chat/sdk"
import { MessengerAttachmentException } from "../exception"
import { facebookAttachmentClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  FacebookMessageAttachment,
  FacebookSendMessageResponse,
  MessengerAuthValue,
} from "../schemas"

export const uploadAttachment = async (
  auth: MessengerAuthValue,
  url: string,
  type: FileType,
): Promise<FacebookSendMessageResponse> => {
  try {
    return await facebookAttachmentClient.post<FacebookSendMessageResponse>(
      `${auth.metadata.version}/me/message_attachments`,
      {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: {
          message: {
            attachment: {
              type,
              payload: {
                is_reusable: true,
                url,
              } as FacebookMessageAttachment["payload"],
            },
          },
        },
      },
    )
  } catch (error) {
    logger.error(error, "Upload attachment failed")
    throw new MessengerAttachmentException("Upload attachment failed", url)
  }
}
