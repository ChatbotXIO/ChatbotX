import type { ContactHandlers } from "@chatbotx.io/sdk"
import { lineFetch } from "../apis/client"
import { toChannelErrorUnlessAuth } from "../lib/error-mapper"
import type { LineAuthValue } from "../schema"

type LineProfile = {
  displayName?: string
  pictureUrl?: string
  language?: string
}

const getProfile: ContactHandlers<LineAuthValue>["getProfile"] = async ({
  ctx,
  data: { sourceId },
}) => {
  try {
    const profile = await lineFetch<LineProfile>(ctx.auth, {
      method: "GET",
      path: `/v2/bot/profile/${encodeURIComponent(sourceId)}`,
    })
    return {
      sourceId,
      firstName: profile.displayName,
      avatar: profile.pictureUrl,
      locale: profile.language,
    }
  } catch (error) {
    throw toChannelErrorUnlessAuth(error)
  }
}

export const contactHandlers: Partial<ContactHandlers<LineAuthValue>> = {
  getProfile,
}
