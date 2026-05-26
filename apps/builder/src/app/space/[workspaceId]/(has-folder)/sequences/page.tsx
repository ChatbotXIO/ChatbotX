import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { AutomationTabs } from "@/components/automation-tabs"
import { listSequences } from "@/features/sequences/queries"
import { listSequencesSearchParamsCache } from "@/features/sequences/schema/action"
import { SequencesTable } from "@/features/sequences/sequences-table"

// Card wrapper removido — Pedro pediu UI flat estilo Respond.io 2026-05-24.
export default async function SequencesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listSequencesSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listSequences({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <AutomationTabs />
      <SequencesTable promises={promises} workspaceId={workspaceId} />
    </div>
  )
}
