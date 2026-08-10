import { instagramIntegrationService } from "@chatbotx.io/business"
import type { InstagramAuthValue } from "@chatbotx.io/integration-instagram"
import {
  getInstagramAccount,
  subscribePageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram"
import {
  getFacebookUser,
  getUserInstagramAccounts,
  subscribePageToInstagramWebhook as subscribeFacebookPageToInstagramWebhook,
} from "@chatbotx.io/integration-instagram-facebook"
import { AuthType } from "@chatbotx.io/sdk"
import type { ReconnectResult } from "@/lib/channel-reconnect"
import {
  buildIntegrationUserInfo,
  lookupIntegrationUserInfo,
} from "@/lib/integration-user-info"
import { logger } from "@/lib/log"

/**
 * Complete an OAuth reconnect for an Instagram integration connected with the
 * direct Instagram login (`type === "instagram"`). The freshly authorized
 * account must be the one already stored (matched by `igId` — never by
 * anything from OAuth state); its long-lived user token replaces the stored
 * one. The account-select screen is skipped entirely.
 */
export async function reconnectInstagramHandler(props: {
  credentialConfig: { clientId: string; clientSecret: string; version: string }
  workspaceId: string
  integrationId: string
  userToken: string
}): Promise<ReconnectResult> {
  const integrationInstagram =
    await instagramIntegrationService.findByIdForWorkspace({
      id: props.integrationId,
      workspaceId: props.workspaceId,
    })
  if (integrationInstagram?.type !== "instagram") {
    return { status: "error", reason: "notFound" }
  }

  try {
    const account = await getInstagramAccount(props.userToken)
    if (!account || account.userId !== integrationInstagram.igId) {
      return { status: "error", reason: "accountNotFound" }
    }

    const auth: InstagramAuthValue = {
      authType: AuthType.oauth2,
      clientId: props.credentialConfig.clientId,
      clientSecret: props.credentialConfig.clientSecret,
      redirectUrl: "",
      tokens: {
        accessToken: props.userToken,
      },
      metadata: {
        igId: integrationInstagram.igId,
        igName: account.name,
        pageId: integrationInstagram.pageId,
        version: props.credentialConfig.version,
      },
    }

    // Direct Instagram login authenticates as the account itself, so the
    // account IS the user. Best-effort — a failed build leaves `userInfo`
    // untouched.
    const userInfo = await buildIntegrationUserInfo({
      workspaceId: props.workspaceId,
      userId: account.userId,
      userName: account.name,
      userAccessToken: props.userToken,
      avatarUrl: account.profile_picture_url,
      existingAvatar: integrationInstagram.userInfo?.avatar,
    })

    // DB write before the webhook subscription (matching the connect flow) so
    // a failed write never leaves the webhook re-bound while the stored auth
    // still holds the stale token.
    await instagramIntegrationService.updateAuth({
      id: integrationInstagram.id,
      workspaceId: props.workspaceId,
      auth,
      name: account.name,
      username: account.username,
      ...(userInfo ? { userInfo } : {}),
    })

    await subscribePageToInstagramWebhook({
      igId: integrationInstagram.pageId,
      accessToken: props.userToken,
      version: props.credentialConfig.version,
    })

    return { status: "success" }
  } catch (error) {
    logger.error({ err: error }, "Failed to reconnect Instagram integration")
    return { status: "error", reason: "failed" }
  }
}

/**
 * Complete an OAuth reconnect for an Instagram integration connected through
 * Facebook login (`type === "facebook"`). The stored Instagram business
 * account (`igId`) is looked up among the user's pages; its page access token
 * replaces the stored one. `pageId` is refreshed too because the Instagram
 * account may have been re-linked to a different Facebook page.
 */
export async function reconnectInstagramFacebookHandler(props: {
  credentialConfig: { clientId: string; clientSecret: string; version: string }
  workspaceId: string
  integrationId: string
  userToken: string
}): Promise<ReconnectResult> {
  const integrationInstagram =
    await instagramIntegrationService.findByIdForWorkspace({
      id: props.integrationId,
      workspaceId: props.workspaceId,
    })
  if (integrationInstagram?.type !== "facebook") {
    return { status: "error", reason: "notFound" }
  }

  try {
    const accounts = await getUserInstagramAccounts(
      props.userToken,
      props.credentialConfig.version,
    )
    const account = accounts.find(
      (candidate) => candidate.id === integrationInstagram.igId,
    )
    if (!account) {
      return { status: "error", reason: "accountNotFound" }
    }

    // Best-effort: a failed lookup only leaves `userInfo` untouched.
    const userInfo = await lookupIntegrationUserInfo({
      workspaceId: props.workspaceId,
      userAccessToken: props.userToken,
      existingAvatar: integrationInstagram.userInfo?.avatar,
      fetchUser: () =>
        getFacebookUser(props.userToken, props.credentialConfig.version),
    })

    const auth: InstagramAuthValue = {
      authType: AuthType.oauth2,
      clientId: props.credentialConfig.clientId,
      clientSecret: props.credentialConfig.clientSecret,
      redirectUrl: "",
      tokens: {
        accessToken: account.pageAccessToken,
      },
      metadata: {
        igId: integrationInstagram.igId,
        igName: account.name,
        pageId: account.pageId,
        version: props.credentialConfig.version,
      },
    }

    // DB write before the webhook subscription (matching the connect flow) so
    // a failed write never leaves the webhook bound to the new page while the
    // stored row still points at the old one.
    await instagramIntegrationService.updateAuth({
      id: integrationInstagram.id,
      workspaceId: props.workspaceId,
      auth,
      name: account.name,
      username: account.username,
      pageId: account.pageId,
      ...(userInfo ? { userInfo } : {}),
    })

    await subscribeFacebookPageToInstagramWebhook({
      pageId: account.pageId,
      accessToken: account.pageAccessToken,
      version: props.credentialConfig.version,
    })

    return { status: "success" }
  } catch (error) {
    logger.error(
      { err: error },
      "Failed to reconnect Instagram integration via Facebook",
    )
    return { status: "error", reason: "failed" }
  }
}
