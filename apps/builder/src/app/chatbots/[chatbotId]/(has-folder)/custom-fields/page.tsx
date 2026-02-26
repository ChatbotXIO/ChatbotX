import { rootFolderId } from "@aha.chat/database/enums"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFieldsRSC } from "@/features/custom-fields/queries"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"

export default async function CustomFieldsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = await listCustomFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listCustomFieldsRSC({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])

  return (
    <Suspense>
      <CustomFieldsTable
        chatbotId={params.chatbotId}
        folderId={folderId}
        promises={promises}
      />
    </Suspense>
  )
}
