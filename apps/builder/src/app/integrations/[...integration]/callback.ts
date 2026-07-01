import {
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
import { exchangeCodeForToken as exchangeInstagramCode } from "@chatbotx.io/integration-instagram"
import { exchangeCodeForToken as exchangeMessengerCode } from "@chatbotx.io/integration-messenger"
import type { AuthValue, Oauth2AuthValue } from "@chatbotx.io/sdk"
import {
  createId,
  getPublicUrlFromRequest,
  zodBigintAsString,
} from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import type { NextRequest } from "next/server"
import { z } from "zod"
import { connectTiktokHandler } from "@/features/integration-tiktok/actions/connect.action"
import { connectZaloHandler } from "@/features/integration-zalo/actions/connect-zalo.action"
import { integrations } from "@/integration"
import { getCurrentUserId } from "@/lib/auth/utils"
import {
  encryptAuth,
  FB_INSTAGRAM_PENDING_AUTH_COOKIE,
  FB_MESSENGER_PENDING_AUTH_COOKIE,
  FB_PENDING_AUTH_MAX_AGE,
} from "@/lib/facebook-pending-auth"
import { logger } from "@/lib/log"
import { buildBrokerCallbackUrl } from "@/lib/oauth-broker"
import { resolveRelayTarget, sanitizeReferer } from "@/lib/oauth-referer"

const stateValidationSchema = z.object({
  workspaceId: zodBigintAsString().optional(),
  referer: z.url(),
})

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
    return redirect(await sanitizeReferer(stateParams.referer))
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
    logger.warn(
      { userId, workspaceId: stateParams.workspaceId },
      "user is not a member of workspace in OAuth callback",
    )
    return notFound()
  }

  const safeReferer = await sanitizeReferer(stateParams.referer)
  const code = url.searchParams.get("code") ?? ""

  let authResult: AuthValue
  let googleSheetsAuth: Oauth2AuthValue | null = null
  switch (integrationType) {
    case "messenger": {
      const messengerCredential =
        await platformCredentialService.resolveForOwner({
          ownerId: workspace.ownerId,
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

      const userToken = await exchangeMessengerCode(
        messengerCredential.config,
        code,
        callbackUrl,
      )
      const token = await encryptAuth({
        userToken,
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
          ownerId: workspace.ownerId,
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

    case "tiktok": {
      const tiktokCredential = await platformCredentialService.resolveForOwner({
        ownerId: workspace.ownerId,
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
        ownerId: workspace.ownerId,
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

    case "googleSheets": {
      const googleCredential = await platformCredentialService.resolveForOwner({
        ownerId: workspace.ownerId,
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
