import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { listSequences } from "@/features/sequences/queries"
import { listSequencesSearchParamsCache } from "@/features/sequences/schema"
import { SequencesTable } from "@/features/sequences/sequences-table"

export default async function SequencesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = await listSequencesSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    listSequences({
      ...search,
      chatbotId,
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
        <SequencesTable chatbotId={chatbotId} promises={promises} />
      </CardContent>
    </Card>
  )
}
