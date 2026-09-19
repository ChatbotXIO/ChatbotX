import { rescue, TiktokAPIException } from "../exception"
import { createTiktokBusinessClient } from "../lib/http-client"
import type { BusinessApiResponse, TiktokVideoListResult } from "../schema"

/**
 * Public video posts on the connected account, newest first, for the comment
 * automation post picker.
 *
 * Note the plural path segment (`videos`, not `video`) and that a post is keyed
 * by `item_id` here while every comment endpoint calls the same id `video_id`.
 *
 * `fields` is required in practice: TikTok returns only the fields asked for,
 * so an omitted list yields entries carrying nothing but `item_id`.
 */
export const listTiktokVideos = (
  accessToken: string,
  params: {
    businessId: string
    fields?: string[]
    cursor?: number
    maxCount?: number
  },
): Promise<TiktokVideoListResult> =>
  rescue("business/videos/list", async () => {
    const client = createTiktokBusinessClient(accessToken)
    const searchParams: Record<string, string> = {
      business_id: params.businessId,
      fields: JSON.stringify(
        params.fields ?? [
          "item_id",
          "caption",
          "thumbnail_url",
          "share_url",
          "create_time",
          "comments",
        ],
      ),
    }
    if (params.cursor !== undefined) {
      searchParams.cursor = `${params.cursor}`
    }
    if (params.maxCount !== undefined) {
      searchParams.max_count = `${params.maxCount}`
    }

    const response = await client.get<
      BusinessApiResponse<TiktokVideoListResult>
    >("business/videos/list/", { searchParams })

    if (response.code !== 0) {
      throw new TiktokAPIException(
        response.message ?? "business/videos/list failed",
      )
    }
    return response.data ?? {}
  })
