import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import type { BusinessApiResponse } from "../schema"

type UploadMediaResult = {
  media_id?: string
}

export const uploadAttachment = (
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
      BusinessApiResponse<UploadMediaResult>
    >("business/message/media/upload/", form)

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "TikTok media upload failed",
      )
    }

    const mediaId = response.data?.media_id
    if (!mediaId) {
      throw new Error("No media_id in TikTok upload response")
    }
    return mediaId
  })
