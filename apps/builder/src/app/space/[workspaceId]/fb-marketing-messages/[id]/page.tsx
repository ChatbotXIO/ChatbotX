import { facebookMarketingMessagesService } from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { EditMarketingMessage } from "@/features/facebook-marketing-messages/components/edit-marketing-message"
import { resolveMarketingMessagesGrant } from "@/features/facebook-marketing-messages/lib/grant"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
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
  // Editing writes back to Meta, so it needs a live grant (spec D19). The list
  // renders the re-grant panel with the campaigns read-only underneath.
  if (grant.state !== "valid") {
    return redirect(`/space/${workspaceId}/fb-marketing-messages`)
  }

  const t = await getTranslations()

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
      <FlowStoreProvider workspaceId={workspaceId}>
        <CustomFieldStoreProvider workspaceId={workspaceId}>
          <Suspense>
            <EditMarketingMessage row={row} workspaceId={workspaceId} />
          </Suspense>
        </CustomFieldStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
