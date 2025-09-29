import ky from "ky"
import { MessengerException } from "../exception"
import { logger } from "../lib/logger"
import type {
  FacebookMessageAttachment,
  FacebookSendMessageResponse,
  MessengerAuthValue,
} from "../schemas"

export const uploadAttachment = async (
  auth: MessengerAuthValue,
  url: string,
  type: "image" | "video" | "audio" | "file",
): Promise<FacebookSendMessageResponse> => {
  try {
    return await ky
      .post<FacebookSendMessageResponse>(
        `https://graph.facebook.com/${auth.metadata.version}/me/message_attachments`,
        {
          headers: {
            "Content-Type": "application/json",
          },
          json: {
            access_token: auth.tokens.accessToken,
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
      .json()
  } catch (error) {
    logger.error("Upload attachment failed", error)
    throw new MessengerException("Upload attachment failed")
  }
}
