import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getTriggers } from "@/features/triggers/queries"
import { getTriggersSearchParamsCache } from "@/features/triggers/schema/query"
import { TriggersTable } from "@/features/triggers/triggers-table"

export default async function TriggersPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = getTriggersSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    getTriggers({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("triggers.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <TriggersTable
            folderId={search.folderId}
            promises={promises}
            workspaceId={workspaceId}
          />
        </Suspense>
      </CardContent>
    </Card>
  )
}
