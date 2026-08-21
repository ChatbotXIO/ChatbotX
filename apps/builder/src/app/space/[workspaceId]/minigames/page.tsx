import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MinigamesTable } from "@/features/minigames/minigames-table"
import { listMinigames } from "@/features/minigames/queries"
import { listMinigamesSearchParamsCache } from "@/features/minigames/schemas/query"

export default async function MinigamesPage({
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

  const search = listMinigamesSearchParamsCache.parse(await searchParams)

  const promises = Promise.all([
    listMinigames({
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
          { label: t("minigames.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>Loading...</div>}>
        <MinigamesTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
