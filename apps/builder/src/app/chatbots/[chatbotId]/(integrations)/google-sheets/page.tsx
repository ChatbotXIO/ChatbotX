import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateSpreadsheetDialog } from "@/features/spreadsheets/create-spreadsheet-dialog"
import { listSpreadsheets } from "@/features/spreadsheets/queries/list-spreadsheet.queries"
import { listSpreadsheetsRequest } from "@/features/spreadsheets/schemas/query"
import { SpreadsheetsTable } from "@/features/spreadsheets/spreadsheets-table"

export default async function SpreadsheetsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listSpreadsheetsRequest.parse({
    ...searchParams,
    ...{
      chatbotId,
    },
  })

  const promises = Promise.all([
    listSpreadsheets({
      ...search,
      chatbotId,
    }),
  ])

  return (
    <>
      <div className="mb-4 flex w-full justify-end">
        <CreateSpreadsheetDialog chatbotId={chatbotId} />
      </div>

      <Suspense>
        <SpreadsheetsTable chatbotId={chatbotId} promises={promises} />
      </Suspense>
    </>
  )
}
