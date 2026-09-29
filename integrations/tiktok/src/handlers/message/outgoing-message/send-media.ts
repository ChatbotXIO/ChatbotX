import { uploadAttachment } from "../../../apis/attachment"
import type { TiktokSendMessageRequest } from "../../../schema"

export const uploadAndBuildImagePayload = async (
  accessToken: string,
  businessId: string,
  conversationId: string,
  imageUrl: string,
): Promise<TiktokSendMessageRequest> => {
  const mediaId = await uploadAttachment(accessToken, businessId, imageUrl)
  return {
    business_id: businessId,
    recipient_type: "CONVERSATION",
    recipient: conversationId,
    message_type: "IMAGE",
    image: { media_id: mediaId },
  }
}
