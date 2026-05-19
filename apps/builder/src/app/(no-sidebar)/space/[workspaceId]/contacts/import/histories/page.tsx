import { importTypes } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ImportHistoryTable } from "@/features/import/components/import-history-table"
import { listImports } from "@/features/import/queries/list-imports.queries"
import { listImportsRequest } from "@/features/import/schemas/query"

export default async function ImportContactsHistoriesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const t = await getTranslations()
  const searchParams = await props.searchParams
  const { data: search } = listImportsRequest.safeParse({
    ...searchParams,
    workspaceId,
    type: importTypes.enum.contacts,
  })

  const promises = Promise.all([
    listImports({
      ...(search ?? { workspaceId, type: importTypes.enum.contacts }),
      workspaceId,
      type: importTypes.enum.contacts,
    }),
  ])

  return (
    <div className="space-y-4 p-6">
      <h4 className="font-bold text-xl">
        {t("fields.import.histories.title")}
      </h4>

      <Suspense>
        <ImportHistoryTable promises={promises} />
      </Suspense>
    </div>
  )
}
