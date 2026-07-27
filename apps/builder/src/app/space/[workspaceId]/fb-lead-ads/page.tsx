import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FacebookLeadAdsTable } from "@/features/facebook-lead-ad-automation/components/facebook-lead-ads-table"
import { listFacebookLeadAdsAutomations } from "@/features/facebook-lead-ad-automation/queries"
import { listFacebookLeadAdsSearchParamsCache } from "@/features/facebook-lead-ad-automation/schemas/query"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"

export default async function FacebookLeadAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()
  const search = listFacebookLeadAdsSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listFacebookLeadAdsAutomations({ ...search, workspaceId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("facebookLeadAdsAutomation.title"), href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <CustomFieldStoreProvider workspaceId={workspaceId}>
          <Suspense>
            <FacebookLeadAdsTable
              promises={promises}
              workspaceId={workspaceId}
            />
          </Suspense>
        </CustomFieldStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
