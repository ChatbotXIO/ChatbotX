import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { getTriggers } from "@/features/triggers/queries"
import { getTriggersSearchParamsCache } from "@/features/triggers/schemas/get-trigger-schema"
import { TriggersTable } from "@/features/triggers/triggers-table"

export default async function TriggersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getTriggersSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    getTriggers({
      ...search,
      chatbotId: params.chatbotId,
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
            chatbotId={params.chatbotId}
            folderId={search.folderId}
            promises={promises}
          />
        </Suspense>
      </CardContent>
    </Card>
  )
}
