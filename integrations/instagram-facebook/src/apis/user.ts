import type { Context, IncomingContact } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import { API_URL } from "../constants"
import { InstagramAPIException, rescue } from "../exception"
import { instagramGraphClient } from "../lib/http-client"
import { logger } from "../lib/logger"
import type { InstagramAuthValue, InstagramUserProfile } from "../schemas"

const GRAPH_NONEXISTING_FIELD_ERROR_CODE = 100

const isNonexistingFieldError = (error: unknown): boolean =>
  error instanceof InstagramAPIException &&
  error.code === GRAPH_NONEXISTING_FIELD_ERROR_CODE &&
  error.message.includes("nonexisting field")

const fetchProfileFields = async ({
  ctx,
  psid,
  includeProfilePic,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
  includeProfilePic: boolean
}): Promise<InstagramUserProfile> => {
  const fields = includeProfilePic
    ? "name,username,profile_pic"
    : "name,username"
  const queries = new URLSearchParams({
    fields,
    access_token: ctx.auth.tokens.accessToken,
  })

  try {
    return await instagramGraphClient.get<InstagramUserProfile>(
      `${ctx.auth.metadata.version}/${psid}?${queries.toString()}`,
    )
  } catch (error) {
    // Graph rejects `profile_pic` on some nodes (e.g. the business account's
    // own id echoed back as a commenter). Retry without it instead of failing
    // the whole profile lookup over one unavailable field.
    if (includeProfilePic && isNonexistingFieldError(error)) {
      logger.warn(
        { psid },
        "getUserProfile: profile_pic unavailable, retrying without it",
      )
      return await fetchProfileFields({ ctx, psid, includeProfilePic: false })
    }
    throw error
  }
}

export const getUserProfile = ({
  ctx,
  psid,
}: {
  ctx: Context<InstagramAuthValue>
  psid: string
}): Promise<IncomingContact> => {
  const endpoint = `${API_URL}/${ctx.auth.metadata.version}/${psid}`

  return rescue(endpoint, async () => {
    const response = await fetchProfileFields({
      ctx,
      psid,
      includeProfilePic: true,
    })

    const result: IncomingContact = {
      sourceId: psid,
      firstName: response.name,
    }

    if (response.profile_pic) {
      try {
        result.avatar = await getUserProfilePicture({
          ctx,
          pictureUrl: response.profile_pic,
        })
      } catch (error) {
        logger.error(error, "getUserProfilePicture error")
      }
    }

    return result
  })
}

export const getUserProfilePicture = async ({
  ctx,
  pictureUrl,
}: {
  ctx: Context<InstagramAuthValue>
  pictureUrl: string
}): Promise<string | undefined> => {
  const response = await fetch(pictureUrl, {
    headers: {
      Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      "User-Agent": "node",
    },
  })
  if (response.ok && response.body) {
    const originPath = `${ctx.storagePrefix}/avatars/${createId()}`
    const bytes = await response.arrayBuffer()
    const mimeType = response.headers.get("content-type") ?? "image/png"

    await ctx.uploader?.putObject(originPath, Buffer.from(bytes), {
      ACL: "public-read",
      ContentType: mimeType,
    })

    return originPath
  }
}
