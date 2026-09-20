import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import {
  type BusinessApiResponse,
  TIKTOK_DIRECT_REPLY_TYPE_COMMENT_TO_MESSAGE,
  type TiktokDirectReplyStatus,
} from "../schema"

type DirectReplyGetResult = {
  business_id?: string
  direct_reply_type?: string
  operation_status?: TiktokDirectReplyStatus
}

/**
 * Comment-to-Message is the switch that decides whether TikTok delivers
 * `im_receive_high_intent_comment` for an account at all — with it off, the
 * comment→DM path is silent rather than broken, so the two endpoints below are
 * the only way to tell those apart.
 *
 * Both keep TikTok's own `message` verbatim on rejection. The eligibility rules
 * (Business Account registered in Vietnam, Indonesia or Thailand; owner over
 * 18; a Registered Business Account or one that has run Messaging Ads;
 * messaging permissions "Potential connections" and "Other on TikTok" both set
 * to "Requests") are not checkable from here, and TikTok's wording is the only
 * thing that tells an admin which one they failed.
 */
export const getTiktokDirectReplyStatus = (
  accessToken: string,
  businessId: string,
): Promise<TiktokDirectReplyStatus | undefined> =>
  rescue("business/message/direct_reply/get", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.get<
      BusinessApiResponse<DirectReplyGetResult>
    >("business/message/direct_reply/get/", {
      searchParams: {
        business_id: businessId,
        direct_reply_type: TIKTOK_DIRECT_REPLY_TYPE_COMMENT_TO_MESSAGE,
      },
    })

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ??
          "Failed to read the TikTok Comment-to-Message setting",
      )
    }

    return response.data?.operation_status
  })

export const updateTiktokDirectReplyStatus = (
  accessToken: string,
  businessId: string,
  operationStatus: TiktokDirectReplyStatus,
): Promise<void> =>
  rescue("business/message/direct_reply/update", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const response = await client.post<BusinessApiResponse<unknown>>(
      "business/message/direct_reply/update/",
      {
        json: {
          business_id: businessId,
          direct_reply_type: TIKTOK_DIRECT_REPLY_TYPE_COMMENT_TO_MESSAGE,
          operation_status: operationStatus,
        },
      },
    )

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ??
          "Failed to update the TikTok Comment-to-Message setting",
      )
    }
  })
