import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { CreateMarketingMessage } from "@/features/facebook-marketing-messages/components/create-marketing-message"
import { resolveMarketingMessagesGrant } from "@/features/facebook-marketing-messages/lib/grant"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export default async function CreateFacebookMarketingMessagePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const access = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!access) {
    return notFound()
  }

  // Authoring requires a live grant (spec D19) — send the user back to the
  // list, which renders the grant panel.
  const grant = await resolveMarketingMessagesGrant(access.targetWorkspace)
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
          { label: t("actions.create"), href: "" },
        ]}
      />
      {/* Flow store: the button/quick-reply flow + node pickers.
          Custom field store: MediaLibraryOrInsertLink's variable picker. */}
      <FlowStoreProvider workspaceId={workspaceId}>
        <CustomFieldStoreProvider workspaceId={workspaceId}>
          <Suspense>
            <CreateMarketingMessage workspaceId={workspaceId} />
          </Suspense>
        </CustomFieldStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
