import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateSpreadsheetDialog } from "@/features/spreadsheets/create-spreadsheet-dialog"
import { listSpreadsheets } from "@/features/spreadsheets/queries/list-spreadsheet.queries"
import { listSpreadsheetsRequest } from "@/features/spreadsheets/schema/query"
import { SpreadsheetsTable } from "@/features/spreadsheets/spreadsheets-table"

export default async function SpreadsheetsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listSpreadsheetsRequest.parse({
    ...searchParams,
    ...{
      workspaceId,
    },
  })

  const promises = Promise.all([
    listSpreadsheets({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateSpreadsheetDialog workspaceId={workspaceId} />
      </div>

      <Suspense>
        <SpreadsheetsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </>
  )
}
