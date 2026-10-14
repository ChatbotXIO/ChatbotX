import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { InboundWebhooksTable } from "@/features/inbound-webhooks/components/inbound-webhooks-table"
import { listInboundWebhooks } from "@/features/inbound-webhooks/queries"
import { listInboundWebhooksSearchParamsCache } from "@/features/inbound-webhooks/schema/query"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"

export default async function InboundWebhooksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = await resolveGuardedWorkspaceId(params, "superAdmin")
  const t = await getTranslations()
  const search = listInboundWebhooksSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listInboundWebhooks({ ...search, workspaceId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("inboundWebhooks.title"), href: "" },
        ]}
      />
      <Suspense>
        <InboundWebhooksTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
