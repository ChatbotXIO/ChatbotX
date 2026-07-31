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
import { IgCommentsTable } from "@/features/ig-comments/ig-comments-table"
import { listIgComments } from "@/features/ig-comments/queries"
import { listIgCommentsSearchParamsCache } from "@/features/ig-comments/schema/action"

export default async function IgCommentsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listIgCommentsSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([listIgComments({ ...search, workspaceId })])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("instagramCommentAutomation.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <IgCommentsTable promises={promises} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
