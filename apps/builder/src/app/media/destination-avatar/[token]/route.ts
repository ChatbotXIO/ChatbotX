import {
  publishDestinationAvatarService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { getPublicFileUrl } from "@chatbotx.io/business/utils"
import { createPublishAvatarOps } from "@chatbotx.io/channel-registry/publish-avatar-ops"
import { toLogSafeError } from "@chatbotx.io/logger"
import { type NextRequest, NextResponse } from "next/server"
import { httpLogger } from "@/lib/log"
import { placeholderUrl, resolveMediaRequest } from "../../media-proxy"

type RouteContext = { params: Promise<{ token: string }> }

/**
 * Picture of a publish destination (a Facebook Page, Instagram or Threads
 * inbox), served like the contact avatar route: the stored copy when there is
 * one, otherwise a picture URL resolved live (so the first view already shows
 * it) while the `low` job mirrors it. The page token is used server side only.
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
  const { token } = await context.params
  const resolvedRequest = await resolveMediaRequest({
    kind: "destinationAvatar",
    request,
    token,
  })
  if (resolvedRequest instanceof NextResponse) {
    return resolvedRequest
  }
  const placeholder = () =>
    NextResponse.redirect(placeholderUrl(request, "default-avatar.svg"), 302)

  try {
    const view = await publishDestinationAvatarService.resolveForView(
      {
        publishDestinationId: resolvedRequest.refId,
        workspaceId: resolvedRequest.workspaceId,
      },
      createPublishAvatarOps(),
    )
    if (!view) {
      return new NextResponse(null, { status: 404 })
    }
    if (view.kind === "placeholder") {
      return placeholder()
    }
    if (view.kind === "fresh") {
      return NextResponse.redirect(view.url, 302)
    }
    const { storageUrl } = await resolveTenantSettings({
      workspaceId: resolvedRequest.workspaceId,
    })
    return NextResponse.redirect(getPublicFileUrl(view.path, storageUrl), 302)
  } catch (err) {
    httpLogger.error(
      {
        err: toLogSafeError(err),
        publishDestinationId: resolvedRequest.refId,
      },
      "Failed to serve publish destination avatar; serving placeholder",
    )
    return placeholder()
  }
}
