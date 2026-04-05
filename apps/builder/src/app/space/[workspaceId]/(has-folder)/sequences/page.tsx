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
import { listSequences } from "@/features/sequences/queries"
import { listSequencesSearchParamsCache } from "@/features/sequences/schema/action"
import { SequencesTable } from "@/features/sequences/sequences-table"

export default async function SequencesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listSequencesSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    listSequences({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("sequences.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <SequencesTable promises={promises} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
