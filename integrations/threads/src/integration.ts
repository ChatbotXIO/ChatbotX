import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
} from "@chatbotx.io/sdk"
import {
  getThreadsProfile,
  refreshAccessToken,
  type ThreadsOAuthProfile,
} from "./apis/auth"
import { ThreadsException } from "./exception"
import { commentHandlers } from "./handlers/comment"
import { webhookHandler } from "./handlers/webhook"
import type { ThreadsActions, ThreadsAuthValue, ThreadsConfig } from "./schema"

const config: IntegrationDefinition<
  ThreadsConfig,
  ThreadsAuthValue,
  ThreadsActions
> = {
  name: "threads",
  channels: {
    channel: {
      comment: commentHandlers,
    },
  },
  actions: {
    getProfile: async ({ ctx }) =>
      (await getThreadsProfile(
        ctx.auth.tokens.accessToken,
        ctx.auth.metadata.version,
      )) as ThreadsOAuthProfile,
  },
  refreshAuth: async ({ auth }) => {
    if (!auth.tokens.accessToken) {
      throw new AuthException("Threads access token not available")
    }

    const refreshed = await refreshAccessToken({
      accessToken: auth.tokens.accessToken,
    })

    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      },
    }
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new ThreadsException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (_auth) => {
    // Threads app/webhook disconnect is handled by row deletion in business layer.
  },
}

export const integration = new Integration<
  IntegrationDefinition<ThreadsConfig, ThreadsAuthValue, ThreadsActions>
>(config)
