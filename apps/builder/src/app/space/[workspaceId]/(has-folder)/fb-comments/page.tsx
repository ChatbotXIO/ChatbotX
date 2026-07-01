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
import { FbCommentsTable } from "@/features/fb-comments/fb-comments-table"
import { listFbComments } from "@/features/fb-comments/queries"
import { listFbCommentsSearchParamsCache } from "@/features/fb-comments/schema/action"

export default async function FbCommentsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listFbCommentsSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([listFbComments({ ...search, workspaceId })])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("facebookCommentAutomation.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FbCommentsTable promises={promises} workspaceId={workspaceId} />
      </CardContent>
    </Card>
  )
}
