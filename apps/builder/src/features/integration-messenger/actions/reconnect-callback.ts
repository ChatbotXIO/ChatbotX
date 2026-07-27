import {
  findMessengerIntegrationByIdForWorkspace,
  updateMessengerIntegrationAuth,
} from "@chatbotx.io/business"
import type { MessengerAuthValue } from "@chatbotx.io/integration-messenger"
import {
  debugToken,
  exchangeCodeForToken,
  getFacebookUser,
  getUserPages,
} from "@chatbotx.io/integration-messenger"
import {
  exchangeLongLivedToken,
  scopesToPageSubscribeFields,
  subscribePageToAppWebhook,
} from "@chatbotx.io/integration-messenger/apis/page"
import { AuthType } from "@chatbotx.io/sdk"
import type { ReconnectResult } from "@/lib/channel-reconnect"
import { lookupIntegrationUserInfo } from "@/lib/integration-user-info"
import { logger } from "@/lib/log"

/**
 * Complete an OAuth reconnect for an existing Messenger integration: the user
 * re-authorized the Facebook app, so exchange the code for a user token, find
 * the already-connected page among the user's pages (matched by the stored
 * `pageId` — never by anything from OAuth state) and store its fresh token.
 * The page-select screen is skipped entirely.
 */
export async function reconnectMessengerHandler(props: {
  credentialConfig: { clientId: string; clientSecret: string; version: string }
  workspaceId: string
  integrationId: string
  code: string
  callbackUrl: string
}): Promise<ReconnectResult> {
  const integrationMessenger = await findMessengerIntegrationByIdForWorkspace({
    id: props.integrationId,
    workspaceId: props.workspaceId,
  })
  if (!integrationMessenger) {
    return { status: "error", reason: "notFound" }
  }

  try {
    const shortLivedToken = await exchangeCodeForToken(
      props.credentialConfig,
      props.code,
      props.callbackUrl,
    )
    const userToken = await exchangeLongLivedToken(
      props.credentialConfig,
      shortLivedToken,
    ).catch((error) => {
      logger.warn(
        { err: error },
        "Messenger long-lived token exchange failed during reconnect, using short-lived token",
      )
      return shortLivedToken
    })

    const { pages } = await getUserPages(
      userToken,
      props.credentialConfig.version,
    )
    const page = pages.find(
      (userPage) =>
        userPage.id === integrationMessenger.pageId && userPage.access_token,
    )
    if (!page?.access_token) {
      return { status: "error", reason: "pageNotFound" }
    }

    const pageToken = await exchangeLongLivedToken(
      props.credentialConfig,
      page.access_token,
    )

    // Best-effort: a failed lookup only leaves `userInfo` untouched.
    const userInfo = await lookupIntegrationUserInfo({
      workspaceId: props.workspaceId,
      userAccessToken: userToken,
      existingAvatar: integrationMessenger.userInfo?.avatar,
      fetchUser: () =>
        getFacebookUser(userToken, props.credentialConfig.version),
    })

    const auth: MessengerAuthValue = {
      authType: AuthType.oauth2,
      clientId: props.credentialConfig.clientId,
      clientSecret: props.credentialConfig.clientSecret,
      redirectUrl: "",
      tokens: {
        accessToken: pageToken,
      },
      metadata: {
        pageId: integrationMessenger.pageId,
        pageName: page.name,
        version: props.credentialConfig.version,
      },
    }

    // DB write before the webhook subscription (matching the connect flow) so
    // a failed write never leaves the webhook re-bound while the stored auth
    // still holds the stale token.
    await updateMessengerIntegrationAuth({
      id: integrationMessenger.id,
      workspaceId: props.workspaceId,
      auth,
      name: page.name,
      ...(userInfo ? { userInfo } : {}),
    })

    // Re-subscribe the page to exactly the webhook fields its reconnected
    // token's scopes support (a plain reconnect would otherwise re-subscribe
    // with only the base fields and silently drop `leadgen` delivery for any
    // Facebook Lead Ads automation on this page). Best-effort: a failed
    // debug_token check falls back to the base subscription.
    const debug = await debugToken(
      pageToken,
      props.credentialConfig.version,
    ).catch(() => undefined)

    await subscribePageToAppWebhook({
      pageId: integrationMessenger.pageId,
      accessToken: pageToken,
      version: props.credentialConfig.version,
      subscribedFields: scopesToPageSubscribeFields(debug?.scopes).join(","),
    })

    return { status: "success" }
  } catch (error) {
    logger.error({ err: error }, "Failed to reconnect Messenger integration")
    return { status: "error", reason: "failed" }
  }
}
