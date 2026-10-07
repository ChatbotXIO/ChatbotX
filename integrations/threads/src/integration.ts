import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  oauth2Auth,
  probeVerify,
} from "@chatbotx.io/sdk"
import {
  exchangeCodeForToken,
  getThreadsProfile,
  refreshAccessToken,
  type ThreadsOAuthProfile,
} from "./apis/auth"
import { getReplyGifUrl } from "./apis/comment"
import { getPostDetails } from "./apis/post"
import { THREADS_OAUTH_URL, THREADS_SCOPES } from "./constants"
import { ThreadsException } from "./exception"
import { commentHandlers } from "./handlers/comment"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import type { ThreadsActions, ThreadsAuthValue, ThreadsConfig } from "./schema"

const config: IntegrationDefinition<
  ThreadsConfig,
  ThreadsAuthValue,
  ThreadsActions
> = {
  name: "threads",
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: false,
    configFields: [],
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as ThreadsConfig
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: THREADS_SCOPES.join(","),
        state,
      })
      return `${THREADS_OAUTH_URL}/oauth/authorize?${params.toString()}`
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as ThreadsConfig
      const { accessToken, expiresAt } = await exchangeCodeForToken(
        config,
        code,
        callbackUrl,
      )
      const profile = await getThreadsProfile(accessToken, config.version)
      return oauth2Auth(
        config,
        callbackUrl,
        { accessToken, expiresAt },
        {
          threadsUserId: profile.id,
          username: profile.username,
          version: config.version,
        },
      ) satisfies ThreadsAuthValue
    },
    candidateToConfig: (auth) => ({
      username: auth.metadata.username,
    }),
    describe: (auth) => ({
      sourceId: auth.metadata.threadsUserId,
      displayName: auth.metadata.username,
    }),
    verify: async ({ auth }) =>
      await probeVerify(
        async () => {
          const profile = await getThreadsProfile(
            auth.tokens.accessToken,
            auth.metadata.version,
          )
          if (profile.id !== auth.metadata.threadsUserId) {
            throw new Error("Threads account could not be verified")
          }
        },
        {
          label: "Threads connection",
          expiresAt: auth.tokens.expiresAt,
          isRevoked: isRevokedTokenError,
        },
      ),
    isRevokedTokenError,
  },
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
    getPostDetails: async ({ ctx, input }) =>
      await getPostDetails(ctx.auth, input.postId),
    getReplyGifUrl: async ({ ctx, input }) =>
      await getReplyGifUrl(ctx.auth, input.replyId),
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
