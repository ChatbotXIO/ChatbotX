import {
  appointmentExternalCalendarService,
  integrationFacebookAdsService,
  integrationMetaCatalogService,
  platformCredentialService,
  workspaceMemberService,
  workspaceService,
} from "@chatbotx.io/business"
import { db } from "@chatbotx.io/database/client"
import type { IntegrationType } from "@chatbotx.io/database/partials"
import {
  integrationGoogleSheetsModel,
  integrationModel,
} from "@chatbotx.io/database/schema"
import {
  exchangeCodeForToken as exchangeFacebookAdsCode,
  exchangeLongLivedToken as exchangeFacebookAdsLongLivedToken,
  type FacebookAdsAuthValue,
} from "@chatbotx.io/integration-facebook-ads"
import { exchangeCodeForToken as exchangeInstagramCode } from "@chatbotx.io/integration-instagram"
import {
  exchangeCodeForToken as exchangeInstagramFacebookCode,
  getFacebookUser as getInstagramFacebookUser,
} from "@chatbotx.io/integration-instagram-facebook"
import {
  exchangeCodeForToken as exchangeMessengerCode,
  type FacebookUser,
  getFacebookUser as getMessengerFacebookUser,
} from "@chatbotx.io/integration-messenger"
import { exchangeLongLivedToken as exchangeMessengerLongLivedToken } from "@chatbotx.io/integration-messenger/apis/page"
import type { MetaCatalogAuthValue } from "@chatbotx.io/integration-meta-catalog/schemas"
import {
  AuthType,
  type AuthValue,
  type Oauth2AuthValue,
} from "@chatbotx.io/sdk"
import {
  createId,
  getPublicUrlFromRequest,
  zodBigintAsString,
} from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { exchangeAndVerifyGoogleCalendar } from "@/features/external-calendars/lib/google-calendar-provider"
import { enableLeadgenForWorkspacePages } from "@/features/facebook-lead-ad-automation/lib/pages"
import {
  reconnectInstagramFacebookHandler,
  reconnectInstagramHandler,
} from "@/features/integration-instagram/actions/reconnect-callback"
import { reconnectMessengerHandler } from "@/features/integration-messenger/actions/reconnect-callback"
import { connectTiktokHandler } from "@/features/integration-tiktok/actions/connect.action"
import { connectZaloHandler } from "@/features/integration-zalo/actions/connect-zalo.action"
import { integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth/utils"
import { buildReconnectRedirectUrl } from "@/lib/channel-reconnect"
import {
  encryptAuth,
  FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_PENDING_AUTH_MAX_AGE,
} from "@/lib/facebook-pending-auth"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveRelayTarget, sanitizeReferer } from "@/lib/oauth-referer"
import { resolveOwnerForWorkspace } from "@/lib/platform-credential-owner"

const stateValidationSchema = z.object({
  workspaceId: zodBigintAsString().optional(),
  referer: z.url(),
  // Facebook Ads and Lead Ads reuse the Messenger OAuth callback (the only
  // redirect_uri registered with the Facebook app); the connect action sets
  // this flag so the Messenger branch dispatches to the right token-storage /
  // webhook-subscription logic instead of the page picker.
  flow: z.enum(["facebookAds", "facebookLeadAds", "metaCatalog"]).optional(),
  // Set by the channel "Reconnect" buttons: the callback refreshes the tokens
  // of this existing integration row (matched against its stored page/account
  // identity) instead of running the connect/page-select flow.
  reconnectIntegrationId: zodBigintAsString().optional(),
})

// Exchange the OAuth code for a long-lived Facebook Ads token and store it
// (encrypted) for the workspace. Shared by the Messenger-callback dispatch and
// the dedicated facebook-ads callback case.
const storeFacebookAdsConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null

  const facebookAdsAuth: FacebookAdsAuthValue = {
    authType: AuthType.custom,
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await integrationFacebookAdsService.upsert({
    workspaceId: args.workspaceId,
    auth: facebookAdsAuth,
    tokenExpiresAt,
  })
}

const storeMetaCatalogConnection = async (args: {
  credentialConfig: { clientId: string; clientSecret: string; version?: string }
  code: string
  callbackUrl: string
  workspaceId: string
}): Promise<void> => {
  const shortLivedToken = await exchangeFacebookAdsCode(
    args.credentialConfig,
    args.code,
    args.callbackUrl,
  )
  const { accessToken, expiresIn } = await exchangeFacebookAdsLongLivedToken(
    args.credentialConfig,
    shortLivedToken,
  )
  const tokenExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null
  const auth: MetaCatalogAuthValue = {
    accessToken,
    expiresAt: tokenExpiresAt?.toISOString(),
    version: args.credentialConfig.version,
  }
  await integrationMetaCatalogService.upsert({
    workspaceId: args.workspaceId,
    auth,
    tokenExpiresAt,
  })
}

// Best-effort: the connect flow works without the user identity, so a failed
// lookup only leaves `userInfo` unset on the integration row.
const lookupFacebookUser = async (
  fetchUser: () => Promise<FacebookUser>,
): Promise<FacebookUser | undefined> => {
  try {
    return await fetchUser()
  } catch (error) {
    logger.info({ err: error }, "Failed to fetch Facebook user profile")
    return
  }
}

export const handleCallback = async (
  integrationType: IntegrationType,
  req: NextRequest,
) => {
  if (!(integrationType in integrations)) {
    return notFound()
  }

  // Parse state params to get workspace info
  const url = new URL(getPublicUrlFromRequest(req))
  let rawState: unknown
  try {
    rawState = JSON.parse(
      atob(decodeURIComponent(url.searchParams.get("state") || "")),
    )
  } catch {
    logger.debug(
      { url: url.toString() },
      "state param is not valid base64/JSON",
    )
    return notFound()
  }
  const { data: stateParams } = stateValidationSchema.safeParse(rawState)
  if (!stateParams) {
    logger.debug({ url: url.toString() }, "state is not valid")
    return notFound()
  }

  // A reconnect always targets an integration inside an existing workspace;
  // without a workspaceId the create-workspace branch below would run.
  if (stateParams.reconnectIntegrationId && !stateParams.workspaceId) {
    logger.debug(
      { url: url.toString() },
      "reconnect state is missing workspaceId",
    )
    return notFound()
  }

  // White-label relay: Facebook/TikTok OAuth always lands on the fixed broker
  // callback (the only registered redirect_uri). When the flow started on a
  // branded custom domain, bounce the callback back to that domain — where the
  // user's session cookie lives — preserving the original code + state. The
  // re-entry runs on the white-label host, so this guard does not match again.
  const relayTarget = await resolveRelayTarget(url, stateParams.referer)
  if (relayTarget) {
    return redirect(relayTarget)
  }

  // Facebook returns ?error=access_denied when the user cancels
  if (url.searchParams.get("error")) {
    const cancelReferer = await sanitizeReferer(stateParams.referer)
    // A cancelled reconnect must still surface a toast on the settings page,
    // like every other reconnect outcome.
    if (stateParams.reconnectIntegrationId) {
      return redirect(
        buildReconnectRedirectUrl(cancelReferer, {
          status: "error",
          reason: "cancelled",
        }),
      )
    }
    return redirect(cancelReferer)
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const workspace = stateParams.workspaceId
    ? await workspaceService.findById({ id: stateParams.workspaceId })
    : await workspaceService.create({
        data: {
          name: "New Workspace",
          ownerId: userId,
        },
        createdBy: userId,
      })

  if (
    stateParams.workspaceId &&
    !(await workspaceMemberService.isMember({
      workspaceId: stateParams.workspaceId,
      userId,
    }))
  ) {
    logger.info(
      { userId, workspaceId: stateParams.workspaceId },
      "user is not a member of workspace in OAuth callback",
    )
    return notFound()
  }

  const safeReferer = await sanitizeReferer(stateParams.referer)
  const code = url.searchParams.get("code") ?? ""

  // Resolved once and reused across every case below: a sub-account's
  // workspace must use its reseller's app, not fall through to the platform
  // default just because the sub-account itself owns no tenant.
  const platformOwnerId = await resolveOwnerForWorkspace(workspace)

  let authResult: AuthValue
  let googleSheetsAuth: Oauth2AuthValue | null = null
  switch (integrationType) {
    case "messenger": {
      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: platformOwnerId,
          type: "messenger",
        })
      if (!messengerCredential) {
        return notFound()
      }

      // Must match the redirect_uri used at authorize time (the fixed broker
      // callback), even though this handler may run on a white-label host.
      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/messenger/callback",
      )

      if (stateParams.flow === "metaCatalog") {
        await storeMetaCatalogConnection({
          credentialConfig: messengerCredential.config,
          code,
          callbackUrl,
          workspaceId: workspace.id,
        })
        const setupUrl = new URL(safeReferer)
        setupUrl.searchParams.set("metaCatalog", "setup")
        return redirect(setupUrl.toString())
      }

      // Facebook Ads OAuth is routed through this same Messenger callback; the
      // state `flow` flag marks it. Store the Ads token and return the user to
      // the referer (the integrations settings page) instead of the Messenger
      // page picker.
      if (stateParams.flow === "facebookAds") {
        await storeFacebookAdsConnection({
          credentialConfig: messengerCredential.config,
          code,
          callbackUrl,
          workspaceId: workspace.id,
        })
        return redirect(safeReferer)
      }

      // Lead Ads re-auth: the grant just added `leads_retrieval` to the user↔app
      // permissions (so existing page tokens gain it). Subscribe eligible pages
      // to the `leadgen` webhook field, then return to the Lead Ads list — no
      // token is stored and the Messenger page-picker is skipped.
      if (stateParams.flow === "facebookLeadAds") {
        await enableLeadgenForWorkspacePages(workspace.id)
        return redirect(safeReferer)
      }

      if (stateParams.reconnectIntegrationId) {
        const result = await reconnectMessengerHandler({
          credentialConfig: messengerCredential.config,
          workspaceId: workspace.id,
          integrationId: stateParams.reconnectIntegrationId,
          code,
          callbackUrl,
        })
        return redirect(buildReconnectRedirectUrl(safeReferer, result))
      }

      const shortLivedToken = await exchangeMessengerCode(
        messengerCredential.config,
        code,
        callbackUrl,
      )
      // Exchange for a long-lived user token before the page-select step so
      // the pending-auth cookie stays usable even when the user leaves the
      // picker open for a long time. Best-effort: the short-lived token still
      // covers the normal flow if the exchange fails.
      const userToken = await exchangeMessengerLongLivedToken(
        messengerCredential.config,
        shortLivedToken,
      ).catch((error) => {
        logger.info(
          { err: error },
          "Messenger long-lived token exchange failed, using short-lived token",
        )
        return shortLivedToken
      })
      const fbUser = await lookupFacebookUser(() =>
        getMessengerFacebookUser(userToken, messengerCredential.config.version),
      )
      const token = await encryptAuth({
        userToken,
        userId: fbUser?.id,
        userName: fbUser?.name,
        userAvatarUrl: fbUser?.avatarUrl,
        workspaceId: workspace.id,
        referer: safeReferer,
        version: messengerCredential.config.version,
        expiresAt: Date.now() + FB_PENDING_AUTH_MAX_AGE * 1000,
      })

      const cookieStore = await cookies()
      cookieStore.set(FB_MESSENGER_PENDING_AUTH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: FB_PENDING_AUTH_MAX_AGE,
        path: "/channels/messenger/select",
      })
      return redirect(
        new URL("/channels/messenger/select", safeReferer).toString(),
      )
    }

    case "instagram": {
      const instagramCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: platformOwnerId,
          type: "instagram",
        })
      if (!instagramCredential) {
        return notFound()
      }

      // Must match the redirect_uri used at authorize time (the fixed broker
      // callback), even though this handler may run on a white-label host.
      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/instagram/callback",
      )

      const { accessToken: userToken } = await exchangeInstagramCode(
        instagramCredential.config,
        code,
        callbackUrl,
      )

      if (stateParams.reconnectIntegrationId) {
        const result = await reconnectInstagramHandler({
          credentialConfig: instagramCredential.config,
          workspaceId: workspace.id,
          integrationId: stateParams.reconnectIntegrationId,
          userToken,
        })
        return redirect(buildReconnectRedirectUrl(safeReferer, result))
      }

      const token = await encryptAuth({
        userToken,
        workspaceId: workspace.id,
        referer: safeReferer,
        version: instagramCredential.config.version,
        expiresAt: Date.now() + FB_PENDING_AUTH_MAX_AGE * 1000,
      })
      const cookieStore = await cookies()
      cookieStore.set(FB_INSTAGRAM_PENDING_AUTH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: FB_PENDING_AUTH_MAX_AGE,
        path: "/channels/instagram/select",
      })
      return redirect(
        new URL("/channels/instagram/select", safeReferer).toString(),
      )
    }

    case "instagramFacebook": {
      const instagramFacebookCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: platformOwnerId,
          type: "instagramFacebook",
        })
      if (!instagramFacebookCredential) {
        return notFound()
      }

      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/instagram-facebook/callback",
      )

      const userToken = await exchangeInstagramFacebookCode(
        instagramFacebookCredential.config,
        code,
        callbackUrl,
      )
      if (stateParams.reconnectIntegrationId) {
        const result = await reconnectInstagramFacebookHandler({
          credentialConfig: instagramFacebookCredential.config,
          workspaceId: workspace.id,
          integrationId: stateParams.reconnectIntegrationId,
          userToken,
        })
        return redirect(buildReconnectRedirectUrl(safeReferer, result))
      }

      const fbUser = await lookupFacebookUser(() =>
        getInstagramFacebookUser(
          userToken,
          instagramFacebookCredential.config.version,
        ),
      )

      const token = await encryptAuth({
        userToken,
        userId: fbUser?.id,
        userName: fbUser?.name,
        userAvatarUrl: fbUser?.avatarUrl,
        workspaceId: workspace.id,
        referer: safeReferer,
        version: instagramFacebookCredential.config.version,
        expiresAt: Date.now() + FB_PENDING_AUTH_MAX_AGE * 1000,
      })
      const cookieStore = await cookies()
      cookieStore.set(FB_INSTAGRAM_FACEBOOK_PENDING_AUTH_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: FB_PENDING_AUTH_MAX_AGE,
        path: "/channels/instagram-facebook/select",
      })
      return redirect(
        new URL("/channels/instagram-facebook/select", safeReferer).toString(),
      )
    }

    case "tiktok": {
      const tiktokCredential = await platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "tiktok",
      })
      if (!tiktokCredential) {
        return notFound()
      }

      // Must match the redirect_uri used at authorize time (the fixed broker
      // callback), even though this handler may run on a white-label host.
      const tiktokCallbackUrl = buildBrokerCallbackUrl(
        "/integrations/tiktok/callback",
      )

      await connectTiktokHandler({
        tiktokSettings: tiktokCredential.config,
        workspaceId: workspace.id,
        req,
        redirectUrl: tiktokCallbackUrl,
      })

      return redirect(safeReferer)
    }

    case "zalo": {
      const zaloCredential = await platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "zalo",
      })
      if (!zaloCredential) {
        return notFound()
      }

      await connectZaloHandler({
        zaloSettings: zaloCredential.config,
        workspaceId: workspace.id,
        req,
      })

      return redirect(safeReferer)
    }

    case "facebookAds": {
      // Facebook Ads reuses the Messenger Facebook app credential; only the
      // requested scopes differ (see `connect.action.ts`).
      const facebookAdsCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: platformOwnerId,
          type: "messenger",
        })
      if (!facebookAdsCredential) {
        return notFound()
      }

      // Must match the redirect_uri used at authorize time (the fixed broker
      // callback), even though this handler may run on a white-label host.
      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/facebook-ads/callback",
      )

      await storeFacebookAdsConnection({
        credentialConfig: facebookAdsCredential.config,
        code,
        callbackUrl,
        workspaceId: workspace.id,
      })

      return redirect(safeReferer)
    }

    case "googleCalendar": {
      const googleCredential = await platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "google",
      })
      if (!googleCredential) {
        return notFound()
      }

      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/google-calendar/callback",
      )
      try {
        const connection = await exchangeAndVerifyGoogleCalendar({
          credentialConfig: googleCredential.config,
          req,
          callbackUrl,
          workspaceId: workspace.id,
        })

        await appointmentExternalCalendarService.createGoogleFromOAuthCallback({
          workspaceId: workspace.id,
          auth: connection.auth,
          providerCalendarId: connection.providerCalendarId,
          email: connection.email,
        })

        const successUrl = new URL(safeReferer)
        successUrl.searchParams.set("externalCalendarConnect", "success")

        return redirect(successUrl.toString())
      } catch (error) {
        logger.error(
          { err: normalizeError(error), workspaceId: workspace.id },
          "Failed to connect Google Calendar from OAuth callback",
        )
        const errorUrl = new URL(safeReferer)
        errorUrl.searchParams.set("externalCalendarConnect", "error")

        return redirect(errorUrl.toString())
      }
    }

    case "googleSheets": {
      const googleCredential = await platformCredentialService.resolveForOwner({
        ownerId: platformOwnerId,
        type: "google",
      })
      if (!googleCredential) {
        return notFound()
      }

      // Must match the redirect_uri used at authorize time (the fixed broker
      // callback), even though this handler may run on a white-label host after
      // the relay above. See `connect.action.ts`.
      const callbackUrl = buildBrokerCallbackUrl(
        "/integrations/google-sheets/callback",
      )

      authResult = (await integrations.googleSheets.handleRequest?.({
        config: {
          ...googleCredential.config,
          redirectUrl: callbackUrl,
        },
        req,
      })) as unknown as Oauth2AuthValue
      googleSheetsAuth = authResult
      break
    }

    default:
      return notFound()
  }

  if (!authResult) {
    return notFound()
  }

  await db.transaction(async (tx) => {
    const integrationId = createId()

    await tx.insert(integrationModel).values({
      id: integrationId,
      workspaceId: workspace.id,
      integrationType,
    })

    if (integrationType === "googleSheets" && googleSheetsAuth) {
      await tx.insert(integrationGoogleSheetsModel).values({
        workspaceId: workspace.id,
        integrationId,
        auth: googleSheetsAuth,
      })
    }
  })

  return redirect(safeReferer)
}
