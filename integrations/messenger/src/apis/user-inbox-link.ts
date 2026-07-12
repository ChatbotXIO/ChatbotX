import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

type FacebookConversationLink = {
  id: string
  link?: string
  updated_time?: string
}

type FacebookConversationResponse = {
  data: FacebookConversationLink[]
}

type MessengerAuthContext = {
  auth: MessengerAuthValue
}

const TRAILING_SLASHES_RE = /\/+$/

const toBusinessInboxUrl = (link: string | undefined): string | null => {
  if (!link) {
    return null
  }

  const path = link.split("?")[0]?.replace(TRAILING_SLASHES_RE, "")
  if (!path) {
    return null
  }

  return `https://business.facebook.com${path.startsWith("/") ? "" : "/"}${path}`
}

export const getUserInboxLink = async (props: {
  ctx: MessengerAuthContext
  input: { userId: string }
}): Promise<string | null> => {
  const { ctx, input } = props
  const version = ctx.auth.version ?? DEFAULT_API_VERSION
  const endpoint = `${version}/me/conversations`

  try {
    const response = await rescue(endpoint, () =>
      facebookGraphClient.get<FacebookConversationResponse>(endpoint, {
        headers: {
          Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
        },
        searchParams: {
          user_id: input.userId,
          fields: "link",
        },
      }),
    )

    return toBusinessInboxUrl(response.data[0]?.link)
  } catch {
    return null
  }
}
