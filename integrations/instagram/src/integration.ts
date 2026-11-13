import {
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  oauth2Auth,
  probeVerify,
} from "@chatbotx.io/sdk"
import {
  exchangeCodeForToken,
  exchangeUnifiedCodeForToken,
  fetchInstagramAccount,
  generateUnifiedAuthUrl,
  getUnifiedInstagramAccounts,
} from "./apis/auth"
import {
  refreshLongLivedToken,
  subscribePageToInstagramWebhook,
  unsubscribePageFromInstagramWebhook,
} from "./apis/page"
import { getPostDetails } from "./apis/post"
import { INSTAGRAM_BUSINESS_SCOPES } from "./constants"
import { InstagramAPIException } from "./exception"
import { botHandlers } from "./handlers/bot"
import { commentHandlers } from "./handlers/comment"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import { isRevokedTokenError } from "./lib/error-mapper"
import type {
  InstagramActions,
  InstagramAuthValue,
  InstagramConfig,
} from "./schema"

const config: IntegrationDefinition<
  InstagramConfig,
  InstagramAuthValue,
  InstagramActions
> = {
  name: "instagram",
  connection: {
    kind: "channel",
    strategy: "oauth_redirect",
    multiAccount: true,
    configFields: [],
    authorizeUrl: ({ credential, callbackUrl, state }) => {
      const config = credential as InstagramConfig
      if (config.unifiedLoginConfigId) {
        return generateUnifiedAuthUrl({
          clientId: config.clientId,
          configId: config.unifiedLoginConfigId,
          redirectUrl: callbackUrl,
          state,
        })
      }
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: callbackUrl,
        response_type: "code",
        state,
        scope: INSTAGRAM_BUSINESS_SCOPES.join(","),
      })
      return `https://www.instagram.com/oauth/authorize?${params.toString()}`
    },
    exchangeCode: async ({ code, callbackUrl, credential }) => {
      const config = credential as InstagramConfig
      if (config.unifiedLoginConfigId) {
        const authorization = await exchangeUnifiedCodeForToken(config, code)
        return oauth2Auth(
          config,
          callbackUrl,
          { accessToken: authorization.accessToken },
          {
            igId: "",
            igName: "",
            pageId: "",
            version: config.version,
            loginType: "unified",
            clientBusinessId: authorization.clientBusinessId,
          },
        ) satisfies InstagramAuthValue
      }
      const { accessToken } = await exchangeCodeForToken(
        config,
        code,
        callbackUrl,
      )
      return oauth2Auth(
        config,
        callbackUrl,
        { accessToken },
        {
          igId: "",
          igName: "",
          pageId: "",
          version: config.version,
          loginType: "direct",
        },
      ) satisfies InstagramAuthValue
    },
    listCandidates: async ({ auth }) => {
      const accounts =
        auth.metadata.loginType === "unified"
          ? await getUnifiedInstagramAccounts(
              auth.tokens.accessToken,
              auth.metadata.version,
            )
          : await (async () => {
              const account = await fetchInstagramAccount(
                auth.tokens.accessToken,
              )
              return account ? [account] : []
            })()

      return accounts.map((account) => ({
        sourceId: account.userId,
        displayName: account.name,
        avatarUrl: account.profile_picture_url,
        auth: oauth2Auth(
          auth,
          auth.redirectUrl,
          { accessToken: auth.tokens.accessToken },
          {
            ...auth.metadata,
            igId: account.userId,
            igName: account.name,
            pageId: account.id,
            username: account.username,
          },
        ) satisfies InstagramAuthValue,
      }))
    },
    candidateToConfig: (auth) => ({
      pageId: auth.metadata.pageId,
      username: auth.metadata.username,
    }),
    describe: (auth) => ({
      sourceId: auth.metadata.igId,
      displayName: auth.metadata.igName,
    }),
    verify: async ({ auth }) =>
      await probeVerify(
        async () => {
          const accounts =
            auth.metadata.loginType === "unified"
              ? await getUnifiedInstagramAccounts(
                  auth.tokens.accessToken,
                  auth.metadata.version,
                )
              : await (async () => {
                  const account = await fetchInstagramAccount(
                    auth.tokens.accessToken,
                  )
                  return account ? [account] : []
                })()
          if (
            !accounts.some((account) => account.userId === auth.metadata.igId)
          ) {
            throw new Error("Instagram account could not be verified")
          }
        },
        {
          label: "Instagram connection",
          expiresAt: auth.tokens.expiresAt,
          isRevoked: isRevokedTokenError,
        },
      ),
    isRevokedTokenError,
    webhook: {
      subscribe: ({ auth }) =>
        subscribePageToInstagramWebhook({
          igId: auth.metadata.pageId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
          loginType: auth.metadata.loginType,
        }),
      unsubscribe: ({ auth }) =>
        unsubscribePageFromInstagramWebhook({
          igId: auth.metadata.pageId,
          accessToken: auth.tokens.accessToken,
          version: auth.metadata.version,
          loginType: auth.metadata.loginType,
        }),
    },
  },
  channels: {
    channel: {
      message: messageHandlers,
      comment: commentHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
      bot: botHandlers,
    },
  },
  actions: {
    getPostDetails,
  },
  handleRequest: async (props) => {
    const segments = new URL(props.req.url).pathname.split("/")
    const action = segments.pop()

    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new InstagramAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  disconnect: async (auth: InstagramAuthValue): Promise<void> => {
    await unsubscribePageFromInstagramWebhook({
      igId: auth.metadata.pageId,
      accessToken: auth.tokens.accessToken,
      version: auth.metadata.version,
      loginType: auth.metadata.loginType,
    })
  },
  refreshAuth: async ({ auth }) => {
    // Unified Login returns a Business Integration System User token. It is
    // not an Instagram user token and must never be sent to ig_refresh_token.
    if (auth.metadata.loginType === "unified") {
      return auth
    }
    const refreshed = await refreshLongLivedToken(auth.tokens.accessToken)
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: refreshed.access_token,
        expiresAt: new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString(),
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<InstagramConfig, InstagramAuthValue, InstagramActions>
>(config)
