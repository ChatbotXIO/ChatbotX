import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"

import { CreateFacebookLeadAdAutomationForm } from "@/features/facebook-lead-ad-automation/components/create-facebook-lead-ad-automation"

export default async function CreateFacebookLeadAdPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("facebookLeadAdsAutomation.title"),
            href: `/space/${workspaceId}/fb-lead-ads`,
          },
          { label: t("facebookLeadAdsAutomation.create"), href: "" },
        ]}
      />
      <CreateFacebookLeadAdAutomationForm workspaceId={workspaceId} />
    </div>
  )
}
