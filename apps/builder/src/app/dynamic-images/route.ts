import { contactInboxService } from "@chatbotx.io/business"
import {
  dynamicImageService,
  getDynamicElementIds,
} from "@chatbotx.io/business/dynamic-image"
import { resolveContactVariablesDeep } from "@chatbotx.io/variables"
import { type NextRequest, NextResponse } from "next/server"
import { loadServableWorkspace } from "@/lib/workspace/load-servable-workspace"

export const GET = async (request: NextRequest) => {
  const dynamicImageId = request.nextUrl.searchParams.get("dynamicImageId")
  const userId = request.nextUrl.searchParams.get("userId")

  if (!dynamicImageId) {
    return NextResponse.json(
      { message: "dynamicImageId is required" },
      { status: 400 },
    )
  }

  const dynamicImage = await dynamicImageService.findUnscoped(dynamicImageId)
  if (!dynamicImage) {
    return NextResponse.json(
      { message: "Dynamic image not found" },
      { status: 404 },
    )
  }

  if (!dynamicImage.enabled) {
    return NextResponse.json(
      { message: "Dynamic image is disabled" },
      { status: 404 },
    )
  }

  const { servable } = await loadServableWorkspace(dynamicImage.workspaceId)
  if (!servable) {
    return NextResponse.json(
      { code: "workspaceScheduledDeletion" },
      { status: 410 },
    )
  }

  // With no `userId` — or one that resolves to no contact below — there is
  // no contact to personalize for, so fall back to the config's static
  // background rather than erroring out.
  const redirectToBackground = async () => {
    const backgroundUrl =
      await dynamicImageService.resolveBackgroundUrl(dynamicImage)
    if (!backgroundUrl) {
      return NextResponse.json(
        { message: "Dynamic image has no rendered background" },
        { status: 404 },
      )
    }
    return NextResponse.redirect(backgroundUrl, 302)
  }

  if (!userId) {
    return await redirectToBackground()
  }

  // `userId` is `{{user_id}}` as resolved by the sending channel — the
  // system field for `ContactInbox.sourceId` (the platform's own id for this
  // contact), not `Contact.id`. `sourceId` is only unique per
  // `(inboxId, sourceId)`; this URL carries no inbox/channel to disambiguate
  // with, so the same external id under a different inbox in this workspace
  // could in theory match the wrong contact — accepted as a known
  // limitation of this trigger surface.
  const contactInbox = await contactInboxService.findLatestBySourceId({
    sourceId: userId,
    workspaceId: dynamicImage.workspaceId,
  })
  if (!contactInbox) {
    return await redirectToBackground()
  }
  const contactId = contactInbox.contactId

  const cachedUrl = await dynamicImageService.findCachedUrlForContact({
    dynamicImage,
    contactId,
  })
  if (cachedUrl) {
    return NextResponse.redirect(cachedUrl, 302)
  }

  // Must be computed from `dynamicImage.data` (the raw, unresolved document)
  // — never from the variable-resolved copy below, which no longer carries
  // the `{{...}}` markers `isStaticElement` relies on to tell dynamic text
  // apart from static.
  const dynamicElementIds = getDynamicElementIds(dynamicImage.data)

  const withResolvedImages = await dynamicImageService.resolveDynamicElements({
    workspaceId: dynamicImage.workspaceId,
    contactId,
    document: dynamicImage.data,
  })

  const resolvedDocument = await resolveContactVariablesDeep(
    contactId,
    withResolvedImages,
    { contactInbox },
  )

  const url = await dynamicImageService.renderForContact({
    workspaceId: dynamicImage.workspaceId,
    dynamicImage,
    contactId,
    resolvedDocument,
    dynamicElementIds,
  })

  return NextResponse.redirect(url, 302)
}
