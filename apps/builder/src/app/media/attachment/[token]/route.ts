import { resolveFreshMediaUrl } from "@chatbotx.io/channel-registry/media-hydration"
import { createMessageRepository } from "@chatbotx.io/database/repositories"
import { uploader } from "@chatbotx.io/filesystem"
import { type NextRequest, NextResponse } from "next/server"
import { httpLogger } from "@/lib/log"
import {
  enqueueAttachmentMirror,
  isFailedOriginPath,
  isPendingOriginPath,
  isTerminalMediaError,
  placeholderUrl,
  resolveMediaRequest,
} from "../../media-proxy"

type RouteContext = { params: Promise<{ token: string }> }

const redirectMirrored = async (originPath: string): Promise<NextResponse> =>
  NextResponse.redirect(await uploader.getPresignedDownload(originPath), 302)

export const GET = async (request: NextRequest, context: RouteContext) => {
  const { token } = await context.params
  const resolvedRequest = await resolveMediaRequest({
    kind: "attachment",
    request,
    token,
  })
  if (resolvedRequest instanceof NextResponse) {
    return resolvedRequest
  }

  const unavailable = () =>
    NextResponse.redirect(placeholderUrl(request, "unavailable.svg"), 302)
  const processing = () =>
    NextResponse.redirect(placeholderUrl(request, "processing.svg"), 302)

  const repository = await createMessageRepository()
  const messageCreatedAt =
    resolvedRequest.messageCreatedAt === undefined
      ? undefined
      : new Date(resolvedRequest.messageCreatedAt)
  const lookup = await repository.findAttachmentById({
    id: resolvedRequest.refId,
    workspaceId: resolvedRequest.workspaceId,
    messageCreatedAt,
  })
  if (!lookup) {
    return new NextResponse(null, { status: 404 })
  }

  // Re-mirror this attachment in the background (used on the pending/processing
  // paths so a later render serves the mirrored copy).
  const enqueueMirror = () =>
    enqueueAttachmentMirror({
      attachmentId: lookup.id,
      messageId: lookup.messageId,
      workspaceId: resolvedRequest.workspaceId,
    })

  if (isFailedOriginPath(lookup.originPath)) {
    return unavailable()
  }
  if (!isPendingOriginPath(lookup.originPath)) {
    try {
      return await redirectMirrored(lookup.originPath)
    } catch (err) {
      // A storage signing/config failure must not surface as a broken 500 on
      // the inbox hot path; degrade to the unavailable placeholder.
      httpLogger.error(
        { err, attachmentId: lookup.id },
        "Failed to presign mirrored attachment",
      )
      return unavailable()
    }
  }

  try {
    const freshMedia = await resolveFreshMediaUrl({
      attachmentId: lookup.id,
      workspaceId: resolvedRequest.workspaceId,
    })
    if (freshMedia) {
      enqueueAttachmentMirror({
        attachmentId: lookup.id,
        channel: freshMedia.channel,
        integrationId: freshMedia.integrationId,
        messageId: lookup.messageId,
        workspaceId: resolvedRequest.workspaceId,
      })
      return NextResponse.redirect(freshMedia.url, 302)
    }

    // A concurrent mirror may have completed between the two reads.
    const refreshed = await repository.findAttachmentById({
      id: lookup.id,
      workspaceId: resolvedRequest.workspaceId,
      messageCreatedAt,
    })
    if (refreshed && isFailedOriginPath(refreshed.originPath)) {
      return unavailable()
    }
    if (refreshed && !isPendingOriginPath(refreshed.originPath)) {
      return await redirectMirrored(refreshed.originPath)
    }

    enqueueMirror()
    return processing()
  } catch (err) {
    // Terminal failures are permanent (unavailable); a transient blip is worth
    // logging and re-mirroring so a later render can recover (processing).
    if (isTerminalMediaError(err)) {
      return unavailable()
    }
    httpLogger.error(
      { err, attachmentId: lookup.id },
      "Failed to resolve fresh attachment media URL",
    )
    enqueueMirror()
    return processing()
  }
}
