import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MagicLinksTable } from "@/features/magic-links/magic-links-table"
import { listMagicLinks } from "@/features/magic-links/queries"
import { listMagicLinksSearchParamsCache } from "@/features/magic-links/schemas/query"

export default async function MagicLinksPage({
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

  const search = listMagicLinksSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listMagicLinks({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("tools.title"),
            href: `/space/${workspaceId}/tools`,
          },
          { label: t("magicLinks.title"), href: "" },
        ]}
      />
      <Suspense>
        <MagicLinksTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
