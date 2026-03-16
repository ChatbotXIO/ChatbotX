import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AddSequenceButton } from "@/features/sequences/components/add-sequence-button"
import { listSequences } from "@/features/sequences/queries"
import { getSequencesSearchParamsCache } from "@/features/sequences/schemas/get-sequences-schema"
import { SequencesTable } from "@/features/sequences/sequences-table"

export default async function SequencesPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await props.params
  const searchParams = await props.searchParams
  const search = getSequencesSearchParamsCache.parse(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    listSequences({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <>
      <div className="flex items-center">
        <h4 className="flex-1 font-bold">{t("sequences.heading.title")}</h4>
        <AddSequenceButton />
      </div>
      <Suspense>
        <SequencesTable chatbotId={chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
