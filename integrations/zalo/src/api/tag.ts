import type { Context } from "@chatbotx.io/sdk"
import { ZALO_API_ENDPOINTS } from "../constants"
import { handleZaloError } from "../lib/exception"
import { ZaloHttpClient } from "../lib/http-client"
import type { ZaloActions, ZaloAuthValue } from "../schema/definition"
import { fetchZaloUserDetail } from "./user"

const client = (accessToken: string): ZaloHttpClient =>
  ZaloHttpClient.createAuthenticatedClient(accessToken)

export const tagFollower: ZaloActions["tagFollower"] = ({
  ctx,
  userId,
  tagName,
}: {
  ctx: Context<ZaloAuthValue>
  userId: string
  tagName: string
}) =>
  handleZaloError("Tag follower", async () => {
    await client(ctx.auth.tokens.accessToken).post(
      ZALO_API_ENDPOINTS.OA.TAG_FOLLOWER,
      {
        json: { user_id: userId, tag_name: tagName },
      },
    )
    return { success: true }
  })

export const removeFollowerFromTag: ZaloActions["removeFollowerFromTag"] = ({
  ctx,
  userId,
  tagName,
}: {
  ctx: Context<ZaloAuthValue>
  userId: string
  tagName: string
}) =>
  handleZaloError("Remove follower from tag", async () => {
    await client(ctx.auth.tokens.accessToken).post(
      ZALO_API_ENDPOINTS.OA.RM_FOLLOWER_FROM_TAG,
      {
        json: { user_id: userId, tag_name: tagName },
      },
    )
    return { success: true }
  })

export const listOaTags: ZaloActions["listOaTags"] = ({
  ctx,
}: {
  ctx: Context<ZaloAuthValue>
}) =>
  handleZaloError("List OA tags", async () => {
    const response = await client(ctx.auth.tokens.accessToken).get<{
      data: string[]
    }>(ZALO_API_ENDPOINTS.OA.LIST_TAGS)
    return response.data ?? []
  })

export const removeTag: ZaloActions["removeTag"] = ({
  ctx,
  tagName,
}: {
  ctx: Context<ZaloAuthValue>
  tagName: string
}) =>
  handleZaloError("Remove tag", async () => {
    await client(ctx.auth.tokens.accessToken).post(
      ZALO_API_ENDPOINTS.OA.RM_TAG,
      {
        json: { tag_name: tagName },
      },
    )
    return { success: true }
  })

export const getUserDetail: ZaloActions["getUserDetail"] = ({
  ctx,
  userId,
}: {
  ctx: Context<ZaloAuthValue>
  userId: string
}) =>
  handleZaloError("Get user detail", () =>
    fetchZaloUserDetail({ accessToken: ctx.auth.tokens.accessToken, userId }),
  )
