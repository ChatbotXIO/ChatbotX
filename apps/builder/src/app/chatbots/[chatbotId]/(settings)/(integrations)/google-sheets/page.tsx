import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateSpreadsheetDialog } from "@/features/spreadsheets/create-spreadsheet-dialog"
import { getSpreadSheets } from "@/features/spreadsheets/queries/index"
import { getWorksheetHeaderSearchParams } from "@/features/spreadsheets/schemas"
import { SpreadsheetsTable } from "@/features/spreadsheets/spreadsheets-table"

export default async function SpreadsheetsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = getWorksheetHeaderSearchParams.parse(searchParams)
  const promises = Promise.all([
    getSpreadSheets({
      ...search,
      chatbotId: params.chatbotId,
      page: null,
      perPage: null,
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
