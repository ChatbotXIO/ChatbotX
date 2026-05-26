import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getWebhooks } from "@/features/webhooks/queries"
import { getWebhooksSearchParamsCache } from "@/features/webhooks/schemas/get-webhook-schema"
import { WebhooksTable } from "@/features/webhooks/webhooks-table"

export default async function WebhooksPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = getWebhooksSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    getWebhooks({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <h2 className="font-bold text-xl">{t("webhooks.title")}</h2>
      <Suspense>
        <WebhooksTable
          folderId={search.folderId}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
