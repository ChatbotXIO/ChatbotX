import {
  inboxService,
  qrCodeService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import { getInboxLinks } from "@chatbotx.io/business/utils"
import type { InboxWithIntegrations } from "@chatbotx.io/database/types"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { InboxListLandingPage } from "@/features/inboxes/components/landing-inbox-list"
import { maxPerPage } from "@/lib/shared-request"

export default async function LandingPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")

  if (!(workspaceId && id)) {
    return notFound()
  }

  const { appUrl } = await resolveTenantSettings({
    workspaceId,
  })
  const qrCode = await qrCodeService.find({ workspaceId, id })
  if (!qrCode) {
    return notFound()
  }

  const { data: inboxes } = await inboxService.list({
    workspaceId,
    includes: ["integration"],
    perPage: maxPerPage,
  })
  const refConfig = { type: "reflink" as const, name: qrCode.name }
  const inboxLinks = getInboxLinks(
    appUrl,
    inboxes as InboxWithIntegrations[],
    refConfig,
  )

  if (inboxLinks.length === 0) {
    return notFound()
  }

  if (inboxLinks.length === 1) {
    redirect(inboxLinks[0].url)
  }

  return <InboxListLandingPage inboxLinks={inboxLinks} />
}
