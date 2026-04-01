import { rootFolderId } from "@chatbotx.io/database/enums"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFieldsRSC } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listCustomFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listCustomFieldsRSC({
      ...search,
      chatbotId,
      folderId,
    }),
  ])

  return (
    <Suspense>
      <CustomFieldsTable
        chatbotId={chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
