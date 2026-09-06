import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MarketingMessagesView } from "@/features/facebook-marketing-messages/components/marketing-messages-view"
import { resolveMarketingMessagesGrant } from "@/features/facebook-marketing-messages/lib/grant"
import { listMarketingMessages } from "@/features/facebook-marketing-messages/queries"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function FacebookMarketingMessagesPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  // Routes through `resolveWorkspaceAccess`, so a super admin's synthetic
  // support membership resolves here too (invariant 19).
  const access = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!access) {
    return notFound()
  }

  const t = await getTranslations()
  const [grant, rows] = await Promise.all([
    resolveMarketingMessagesGrant(access.targetWorkspace),
    listMarketingMessages(workspaceId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("facebookMarketingMessages.title"), href: "" },
        ]}
      />
      <Suspense>
        <MarketingMessagesView
          grantState={grant.state}
          rows={rows}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
