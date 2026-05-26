import { rootFolderId } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CustomFieldsTable } from "@/features/custom-fields/custom-field-table"
import { listCustomFieldsRSC } from "@/features/custom-fields/queries"
import { listHiddenContactFieldKeys } from "@/features/custom-fields/queries/visibility"
import { listCustomFieldsSearchParams } from "@/features/custom-fields/schemas/query"

export default async function ContactFieldsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listCustomFieldsSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listCustomFieldsRSC({
      ...search,
      workspaceId,
      folderId,
    }),
  ])

  // Pro dialog "Personalizar visualização" precisamos da lista completa
  // de custom fields (não paginada) pra mostrar todos. Cap em 500 cobre
  // qualquer workspace realista.
  const [allCustomFields, initialHiddenKeys] = await Promise.all([
    listCustomFieldsRSC({
      ...search,
      workspaceId,
      folderId: undefined,
      perPage: 500,
      page: 1,
    }),
    listHiddenContactFieldKeys(workspaceId),
  ])

  return (
    <Suspense>
      <CustomFieldsTable
        allCustomFields={allCustomFields.data}
        folderId={folderId}
        initialHiddenKeys={initialHiddenKeys}
        promises={promises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
