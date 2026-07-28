import { rescue } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { TiktokApiResponse, TiktokSendMessageRequest } from "../schema"

type SendMessageResult = {
  // TikTok's business/message/send/ response nests the created message's id
  // under data.message.message_id, not data.message_id — keep the flat field
  // as a defensive fallback in case a message_type returns a flatter shape.
  message_id?: string
  message?: {
    message_id?: string
  }
}

type UploadMediaResult = {
  media_id?: string
}

export const uploadTiktokMedia = (
  accessToken: string,
  businessId: string,
  imageUrl: string,
): Promise<string> =>
  rescue("business/message/media/upload", async () => {
    const imageResponse = await fetch(imageUrl)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageUrl}`)
    }
    const blob = await imageResponse.blob()

    const form = new FormData()
    form.append("business_id", businessId)
    form.append("file", blob)
    form.append("media_type", "IMAGE")

    const client = createTiktokBusinessClient(accessToken)
    const response = await client.postFormData<
      TiktokApiResponse<UploadMediaResult>
    >("business/message/media/upload/", form)

    const mediaId = response.data?.media_id
    if (!mediaId) {
      throw new Error("No media_id in TikTok upload response")
    }
    return mediaId
  })

export const sendTiktokMessage = (
  accessToken: string,
  payload: TiktokSendMessageRequest,
): Promise<string | undefined> =>
  rescue("business/message/send", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<TiktokApiResponse<SendMessageResult>>(
      "business/message/send/",
      { json: payload },
    )
    const messageId =
      response.data?.message?.message_id ?? response.data?.message_id
    if (!messageId) {
      logger.warn(
        { data: response.data },
        "No message_id in TikTok send response — outgoing message row will keep sourceId=null and its echo will be inserted as a new row",
      )
    }
    return messageId
  })
