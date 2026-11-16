import {
  AuthException,
  HandleRequestType,
  Integration,
  type IntegrationDefinition,
  probeVerify,
} from "@chatbotx.io/sdk"
import {
  getBotInfo,
  getWebhookEndpoint,
  setWebhookEndpoint,
  testWebhookEndpoint,
} from "./apis/bot"
import { issueAccessToken } from "./apis/token"
import { LineAPIException } from "./exception"
import { contactHandlers } from "./handlers/contact"
import { conversationHandlers } from "./handlers/conversation"
import { messageHandlers } from "./handlers/message"
import { webhookHandler } from "./handlers/webhook"
import type { LineActions, LineAuthValue, LineConfig } from "./schema"

const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401

const buildAuth = (
  channelId: string,
  channelSecret: string,
  token: { accessToken: string; expiresAt: string },
  bot: { userId: string; basicId: string },
): LineAuthValue => ({
  authType: "oauth2",
  clientId: channelId,
  clientSecret: channelSecret,
  redirectUrl: "",
  tokens: { accessToken: token.accessToken, expiresAt: token.expiresAt },
  metadata: { botUserId: bot.userId, basicId: bot.basicId },
})

const connect: LineActions["connect"] = async ({
  channelId,
  channelSecret,
}) => {
  let token: { accessToken: string; expiresAt: string }
  try {
    token = await issueAccessToken({ channelId, channelSecret })
  } catch (error) {
    if (error instanceof LineAPIException) {
      throw new LineAPIException(
        `Invalid LINE Channel ID or Channel secret: ${error.message}`,
        error.httpStatusCode || HTTP_BAD_REQUEST,
      )
    }
    throw error
  }
  const probeAuth = buildAuth(channelId, channelSecret, token, {
    userId: "",
    basicId: "",
  })
  const bot = await getBotInfo(probeAuth)
  return { auth: buildAuth(channelId, channelSecret, token, bot), bot }
}

const registerWebhook: LineActions["registerWebhook"] = async ({
  auth,
  webhookUrl,
}) => {
  // D16: overwrite whatever is set; report the previous URL unless it is ours.
  const current = await getWebhookEndpoint(auth)
  const previousWebhookUrl =
    current.endpoint && current.endpoint !== webhookUrl
      ? current.endpoint
      : null
  await setWebhookEndpoint(auth, webhookUrl)
  // The webhook test is NOT run here: connect calls this inside the open DB
  // transaction, where LINE's test request cannot see the uncommitted row.
  // Callers run `testWebhook` after commit (D18: never fails the connect).
  return { previousWebhookUrl }
}

const testWebhook: LineActions["testWebhook"] = async ({ auth }) => {
  const [test, endpoint] = await Promise.allSettled([
    testWebhookEndpoint(auth),
    getWebhookEndpoint(auth),
  ])
  const active = endpoint.status === "fulfilled" && endpoint.value.active
  if (test.status === "fulfilled") {
    return {
      success: test.value.success,
      reason: test.value.success ? undefined : test.value.reason,
      active,
    }
  }
  return {
    success: false,
    reason:
      test.reason instanceof Error
        ? test.reason.message
        : "Webhook test failed",
    active,
  }
}

const config: IntegrationDefinition<LineConfig, LineAuthValue, LineActions> = {
  name: "line",
  channels: {
    channel: {
      message: messageHandlers,
      conversation: conversationHandlers,
      contact: contactHandlers,
    },
  },
  actions: { connect, registerWebhook, testWebhook },
  connection: {
    kind: "channel",
    strategy: "token",
    multiAccount: false,
    configFields: [
      { name: "channelId", type: "string", required: true },
      { name: "channelSecret", type: "secret", required: true },
    ],
    describe: (auth) => ({
      sourceId: auth.clientId,
      displayName: "LINE Official Account",
    }),
    fromCredentials: async (input: {
      channelId: string
      channelSecret: string
    }) => (await connect(input)).auth,
    verify: async ({ auth }) =>
      await probeVerify(() => getBotInfo(auth), { label: "LINE channel" }),
  },
  handleRequest: async (props) => {
    const action = new URL(props.req.url).pathname.split("/").pop()
    switch (action) {
      case HandleRequestType.webhook:
        return await webhookHandler(props)
      default:
        throw new LineAPIException(
          `${props.req.method} ${props.req.url} is not implemented`,
        )
    }
  },
  // D15: stateless channel access tokens expire on their own; nothing to tear down.
  disconnect: async (): Promise<void> => undefined,
  refreshAuth: async ({ auth }) => {
    const token = await issueAccessToken({
      channelId: auth.clientId,
      channelSecret: auth.clientSecret,
    }).catch((error: unknown) => {
      // 400/401 from the token endpoint (invalid_client, invalid_grant, ...)
      // means the credentials were reset or revoked: terminal for the SDK.
      if (
        error instanceof LineAPIException &&
        (error.httpStatusCode === HTTP_BAD_REQUEST ||
          error.httpStatusCode === HTTP_UNAUTHORIZED)
      ) {
        throw new AuthException(
          error.message,
          "lineAuthError",
          error.httpStatusCode,
        )
      }
      throw error
    })
    // The old token is deliberately not revoked: it expires on its own, and revoking could cut off a concurrent send still holding it.
    return {
      ...auth,
      tokens: {
        ...auth.tokens,
        accessToken: token.accessToken,
        expiresAt: token.expiresAt,
      },
    }
  },
}

export const integration = new Integration<
  IntegrationDefinition<LineConfig, LineAuthValue, LineActions>
>(config)
