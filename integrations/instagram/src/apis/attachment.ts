import type { FileType } from "@chatbotx.io/sdk"
import { rescue } from "../exception"
import { instagramAttachmentClient } from "../lib/http-client"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessageResponse,
} from "../schemas"

export const uploadAttachment = (
  auth: InstagramAuthValue,
  url: string,
  type: FileType,
): Promise<InstagramSendMessageResponse> => {
  const endpoint = `${auth.metadata.version}/${auth.metadata.pageId}/message_attachments`

  return rescue(endpoint, () =>
    instagramAttachmentClient.post<InstagramSendMessageResponse>(endpoint, {
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
    }),
  )
}
