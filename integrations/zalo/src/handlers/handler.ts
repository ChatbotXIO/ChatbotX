import type { ContactHandlers } from "@chatbotx.io/sdk"
import { getUserProfile } from "../api"
import type { ZaloAuthValue } from "../schema"

const getProfile: ContactHandlers<ZaloAuthValue>["getProfile"] = async ({
  ctx,
  data: { sourceId, includeAvatar, requestTimeoutMs },
}) => {
  const profile = await getUserProfile({
    ctx,
    psid: sourceId,
    includeAvatar,
    requestTimeoutMs,
  })
  return profile
}

export const contactHandlers = {
  getProfile,
}
