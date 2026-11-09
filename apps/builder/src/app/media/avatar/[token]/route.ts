import { Readable } from "node:stream"
import {
  contactInboxService,
  contactService,
  isNoAvatarSentinelFresh,
  parseNoAvatarSentinel,
} from "@chatbotx.io/business"
import { resolveFreshContactAvatarUrl } from "@chatbotx.io/channel-registry/media-hydration"
import { uploader } from "@chatbotx.io/filesystem"
import { toLogSafeError } from "@chatbotx.io/logger"
import { type NextRequest, NextResponse } from "next/server"
import { httpLogger } from "@/lib/log"
import {
  enqueueAvatarMirror,
  isTerminalMediaError,
  placeholderUrl,
  resolveMediaRequest,
} from "../../media-proxy"

const HTTP_URL_RE = /^https?:\/\//i

type RouteContext = { params: Promise<{ token: string }> }

export const GET = async (request: NextRequest, context: RouteContext) => {
  const { token } = await context.params
  const resolvedRequest = await resolveMediaRequest({
    kind: "avatar",
    request,
    token,
  })
  if (resolvedRequest instanceof NextResponse) {
    return resolvedRequest
  }

  const placeholder = () =>
    NextResponse.redirect(placeholderUrl(request, "default-avatar.svg"), 302)

  const contactInbox = await contactInboxService.findByUncached({
    where: { id: resolvedRequest.refId },
  })
  if (!contactInbox) {
    return placeholder()
  }
  const contact = await contactService.findById({
    workspaceId: resolvedRequest.workspaceId,
    id: contactInbox.contactId,
  })
  if (!contact) {
    return placeholder()
  }

  // Mirror once after a fresh resolve so a later render either recovers the
  // avatar or persists the no-avatar sentinel, instead of re-hitting Graph.
  const mirror = () =>
    enqueueAvatarMirror({
      workspaceId: resolvedRequest.workspaceId,
      contactInboxId: contactInbox.id,
      sourceId: contactInbox.sourceId,
    })

  if (contact.avatar) {
    const sentinel = parseNoAvatarSentinel(contact.avatar)
    if (!sentinel) {
      if (HTTP_URL_RE.test(contact.avatar)) {
        return NextResponse.redirect(contact.avatar, 302)
      }

      try {
        const object = await uploader.getObjectStream(contact.avatar)
        const headers = new Headers({
          "cache-control": "private, max-age=300",
          "content-type": object.contentType ?? "image/jpeg",
        })
        if (object.contentLength !== undefined) {
          headers.set("content-length", String(object.contentLength))
        }
        // Node's stream/web and DOM ReadableStream declarations differ here.
        return new NextResponse(
          Readable.toWeb(object.stream) as unknown as BodyInit,
          { headers },
        )
      } catch (err) {
        httpLogger.error(
          { err: toLogSafeError(err), contactInboxId: contactInbox.id },
          "Failed to load mirrored contact avatar; serving placeholder",
        )
        mirror()
        return placeholder()
      }
    }
    // Fresh no-avatar: serve the guaranteed placeholder, not the stored sentinel
    // key which may be absent from the tenant's bucket.
    if (isNoAvatarSentinelFresh(sentinel.failedAtMs)) {
      return placeholder()
    }
  }

  try {
    const freshAvatarUrl = await resolveFreshContactAvatarUrl({
      contactInboxId: contactInbox.id,
      workspaceId: resolvedRequest.workspaceId,
    })
    mirror()
    return freshAvatarUrl
      ? NextResponse.redirect(freshAvatarUrl, 302)
      : placeholder()
  } catch (err) {
    // Terminal (the fetch will keep failing) or a transient provider/network
    // blip — either way degrade to the placeholder instead of a 502 and mirror
    // once; only the unexpected transient case is worth logging.
    if (!isTerminalMediaError(err)) {
      httpLogger.error(
        { err: toLogSafeError(err), contactInboxId: contactInbox.id },
        "Failed to resolve fresh contact avatar URL; serving placeholder",
      )
    }
    mirror()
    return placeholder()
  }
}
