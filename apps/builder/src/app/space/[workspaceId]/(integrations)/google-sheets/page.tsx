import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { listSpreadsheets } from "@/features/spreadsheets/queries/list-spreadsheet.queries"
import { listSpreadsheetsRequest } from "@/features/spreadsheets/schema/query"
import { SpreadsheetsTable } from "@/features/spreadsheets/spreadsheets-table"

export default async function SpreadsheetsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

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
    <div className="space-y-4">
      <h3 className="font-bold text-xl">{t("googleSheets.title")}</h3>

      <Suspense>
        <SpreadsheetsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
