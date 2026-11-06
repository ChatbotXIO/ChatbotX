import {
  templateInstallationRequestService,
  templateSyncRequestService,
} from "@chatbotx.io/business"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { TemplateInstallationDetail } from "@/features/templates/components/template-installation-detail"
import { nullOnNotFound } from "@/features/templates/lib/not-found-guard"
import { requireTemplateInstallsAccess } from "@/features/templates/lib/page-guard"

/** A tab shows its whole category; well above what one template can install. */
const RESOURCES_PER_TAB = 1000

export default async function TemplateInstallationPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<{ category?: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const installationId = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && installationId)) {
    return notFound()
  }

  const { actor } = await requireTemplateInstallsAccess(workspaceId)

  const { category } = await searchParams
  const detail = await nullOnNotFound(
    templateInstallationRequestService.getDetail({
      workspaceId,
      installationId,
      actor,
    }),
    "template installation page: loading the installation failed",
  )
  if (!detail) {
    return notFound()
  }
  const activeCategory =
    detail.resourceSummary.find((row) => row.category === category)?.category ??
    detail.resourceSummary[0]?.category
  const [resources, history] = await Promise.all([
    activeCategory
      ? templateInstallationRequestService.listResources({
          workspaceId,
          installationId,
          category: activeCategory,
          limit: RESOURCES_PER_TAB,
        })
      : { items: [], nextCursor: null },
    templateSyncRequestService.listHistory({ workspaceId, installationId }),
  ])

  const t = await getTranslations()

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("templates.title"),
            href: `/space/${workspaceId}/templates`,
          },
          {
            label: t("templates.tabs.installed"),
            href: `/space/${workspaceId}/templates/installs`,
          },
          { label: detail.templateName, href: "" },
        ]}
      />
      <TemplateInstallationDetail
        activeCategory={activeCategory}
        detail={detail}
        history={history}
        resources={resources}
        workspaceId={workspaceId}
      />
    </div>
  )
}
