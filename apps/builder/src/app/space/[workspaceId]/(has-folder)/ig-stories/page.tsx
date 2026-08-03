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
import { IgStoriesTable } from "@/features/ig-stories/ig-stories-table"
import { listIgStories } from "@/features/ig-stories/queries"
import { listIgStoriesSearchParamsCache } from "@/features/ig-stories/schema/action"

export default async function IgStoriesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listIgStoriesSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([listIgStories({ ...search, workspaceId })])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("instagramStoryAutomation.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <IgStoriesTable promises={promises} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
