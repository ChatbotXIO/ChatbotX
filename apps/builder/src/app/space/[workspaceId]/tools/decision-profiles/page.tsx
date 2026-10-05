import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { listDecisionConnections } from "@/features/decision-connections/queries/list-decision-connections.query"
import { DecisionProfilesPage } from "@/features/decision-profiles/components/decision-profiles-page"
import { listDecisionProfiles } from "@/features/decision-profiles/queries/list-decision-profiles.query"
import { listDecisionProfilesSearchParamsCache } from "@/features/decision-profiles/schema/query"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function DecisionProfilesToolsPage({
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

  const [t, search] = await Promise.all([
    getTranslations(),
    listDecisionProfilesSearchParamsCache.parse(await searchParams),
    requireWorkspacePermission(workspaceId, "superAdmin"),
  ])

  const promises = Promise.all([
    listDecisionConnections(workspaceId),
    listDecisionProfiles({ ...search, workspaceId }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { href: `/space/${workspaceId}/tools`, label: t("tools.title") },
          { href: "", label: t("decision.profiles") },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <DecisionProfilesPage promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
