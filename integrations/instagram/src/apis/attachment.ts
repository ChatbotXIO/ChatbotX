import type { FileType } from "@chatbotx.io/sdk"
import { InstagramAttachmentException } from "../exception"
import { instagramAttachmentClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessageResponse,
} from "../schemas"

export const uploadAttachment = async (
  auth: InstagramAuthValue,
  url: string,
  type: FileType,
): Promise<InstagramSendMessageResponse> => {
  try {
    return await instagramAttachmentClient.post<InstagramSendMessageResponse>(
      `${auth.metadata.version}/${auth.metadata.pageId}/message_attachments`,
      {
        headers: {
          Authorization: `Bearer ${auth.tokens.accessToken}`,
        },
        json: {
          platform: "instagram",
          message: {
            attachment: {
              type,
              payload: {
                url,
                is_reusable: true,
              } as InstagramMessageAttachment["payload"],
            },
          },
        },
      },
    )
  } catch (error) {
    logger.error(error, "Upload attachment failed")
    throw new InstagramAttachmentException("Upload attachment failed", url)
  }
}
