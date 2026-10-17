import { folderTypes, rootFolderId } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AutomatedResponsesTable } from "@/features/automated-response/automated-response-table"
import { listAutomatedResponses } from "@/features/automated-response/queries"
import { listAutomatedResponsesSearchParams } from "@/features/automated-response/schema/query"
import { WithFolderBar } from "@/features/folders/with-folder-bar"

export default async function AutomatedResponesPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listAutomatedResponsesSearchParams.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listAutomatedResponses({
      ...search,
      type: "inbound",
      folderId,
      workspaceId,
    }),
  ])

  return (
    <WithFolderBar
      folderType={folderTypes.enum.automatedResponse}
      searchParams={props.searchParams}
      workspaceId={workspaceId}
    >
      <Suspense>
        <AutomatedResponsesTable
          basePath="automated-responses"
          promises={promises}
          type="inbound"
          workspaceId={workspaceId}
        />
      </Suspense>
    </WithFolderBar>
  )
}
