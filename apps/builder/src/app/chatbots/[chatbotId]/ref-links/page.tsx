import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { AddReflinkButton } from "@/features/ref-links/components/add-automated-response-button"
import { getReflinks } from "@/features/ref-links/queries"
import { ReflinksTable } from "@/features/ref-links/ref-links-table"
import { listReflinksParams } from "@/features/ref-links/schemas/get-ref-links-schema"

export default async function ReflinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await params
  const t = await getTranslations()

  const search = listReflinksParams.parse(await searchParams)

  const promises = Promise.all([
    getReflinks({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <h4 className="flex-1 font-bold">{t("fields.reflink.label")}</h4>
        <AddReflinkButton />
      </div>
      <ReflinksTable chatbotId={chatbotId} promises={promises} />
    </div>
  )
}
