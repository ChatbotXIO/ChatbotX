import {
  facebookMarketingMessageDeliveryService,
  facebookMarketingMessagesService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"

import { CampaignDetail } from "@/features/facebook-marketing-messages/components/campaign-detail"
import { EditMarketingMessage } from "@/features/facebook-marketing-messages/components/edit-marketing-message"
import { GrantPanel } from "@/features/facebook-marketing-messages/components/grant-panel"
import { resolveMarketingMessagesGrant } from "@/features/facebook-marketing-messages/lib/grant"

import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function EditFacebookMarketingMessagePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolved = await params
  const workspaceId = getIdFromParams(resolved, "workspaceId")
  const id = getIdFromParams(resolved, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }

  const access = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!access) {
    return notFound()
  }

  const [grant, row] = await Promise.all([
    resolveMarketingMessagesGrant(access.targetWorkspace),
    facebookMarketingMessagesService.find({ id, workspaceId }),
  ])
  if (!row) {
    return notFound()
  }
  // Editing writes back to Meta, so it needs a live grant (spec D19). Without
  // one the status, reason and errors stay viewable (and Stop reachable) with a
  // re-grant panel instead of the edit form.
  const grantState = grant.state

  const [t, stats] = await Promise.all([
    getTranslations(),
    facebookMarketingMessageDeliveryService.getStats({ id, workspaceId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("facebookMarketingMessages.title"),
            href: `/space/${workspaceId}/fb-marketing-messages`,
          },
          { label: row.name, href: "" },
        ]}
      />
      <CampaignDetail campaign={row} stats={stats} workspaceId={workspaceId} />
      {grantState === "valid" ? (
        <Suspense>
          <EditMarketingMessage row={row} workspaceId={workspaceId} />
        </Suspense>
      ) : (
        <GrantPanel state={grantState} workspaceId={workspaceId} />
      )}
    </div>
  )
}
