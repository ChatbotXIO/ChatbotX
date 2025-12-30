import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { AddRefLinkButton } from "@/features/ref-links/components/add-automated-response-button"
import { getRefLinks } from "@/features/ref-links/queries"
import { RefLinksTable } from "@/features/ref-links/ref-links-table"
import { listRefLinksParams } from "@/features/ref-links/schemas/get-ref-links-schema"

export default async function RefLinksPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotId } = await params
  const t = await getTranslations()

  const search = listRefLinksParams.parse(await searchParams)

  const promises = Promise.all([
    getRefLinks({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center">
        <h4 className="flex-1 font-bold">{t("fields.refLink.label")}</h4>
        <AddRefLinkButton />
      </div>
      <RefLinksTable chatbotId={chatbotId} promises={promises} />
    </div>
  )
}
