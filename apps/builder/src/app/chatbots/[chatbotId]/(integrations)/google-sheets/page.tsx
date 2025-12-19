import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateSpreadsheetDialog } from "@/features/spreadsheets/create-spreadsheet-dialog"
import { listSpreadsheets } from "@/features/spreadsheets/queries/list-spreadsheet.queries"
import { listSpreadsheetsRequest } from "@/features/spreadsheets/schemas/list-spreadsheets.request"
import { SpreadsheetsTable } from "@/features/spreadsheets/spreadsheets-table"

export default async function SpreadsheetsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listSpreadsheetsRequest.parse({
    ...searchParams,
    ...{
      chatbotId: params.chatbotId,
    },
  })

  const promises = Promise.all([
    listSpreadsheets({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateSpreadsheetDialog chatbotId={params.chatbotId} />
      </div>

      <Suspense>
        <SpreadsheetsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
