import type { Context } from "@chatbotx.io/sdk"
import { DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import { facebookGraphClient } from "../lib/http-client"
import type { MessengerAuthValue } from "../schema"

export type FacebookPostDetails = {
  message?: string
  full_picture?: string
  from?: { id: string; name: string }
  created_time: string
}

export const getPostDetails = (props: {
  ctx: Context<MessengerAuthValue>
  input: { postId: string }
}): Promise<FacebookPostDetails> => {
  const { ctx, input } = props
  const { version = DEFAULT_API_VERSION } = ctx.auth
  const endpoint = `${version}/${input.postId}`

  return rescue(endpoint, () =>
    facebookGraphClient.get<FacebookPostDetails>(endpoint, {
      headers: {
        Authorization: `Bearer ${ctx.auth.tokens.accessToken}`,
      },
      searchParams: {
        fields: "message,full_picture,from,created_time",
      },
    }),
  )
}
