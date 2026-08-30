import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { DynamicImagesTable } from "@/features/dynamic-images/dynamic-images-table"
import { listDynamicImages } from "@/features/dynamic-images/queries"
import { listDynamicImagesSearchParamsCache } from "@/features/dynamic-images/schema/query"

export default async function DynamicImagesPage({
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

  const search = listDynamicImagesSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listDynamicImages({
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
          { label: t("dynamicImages.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>Loading...</div>}>
        <DynamicImagesTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
