import type { FolderModel } from "@aha.chat/database/types"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateFlowDialog } from "@/features/flows/create-flow-dialog"
import { FlowsTable } from "@/features/flows/flows-table"
import { getFlows } from "@/features/flows/queries"
import { listFlowsSearchParams } from "@/features/flows/schemas/get-flows-schema"
import { getCurrentFolder } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"

export default async function FlowsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const search = listFlowsSearchParams.parse(searchParams)
  const { folderId } = listFoldersSearchParams.parse(searchParams)

  const promises = Promise.all([
    search.folderId
      ? getCurrentFolder({
          id: search.folderId,
          chatbotId: params.chatbotId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    getFlows({
      ...search,
      chatbotId: params.chatbotId,
      folderId,
    }),
  ])

  return (
    <div>
      <div className="mb-4 flex w-full justify-end">
        <CreateFlowDialog
          chatbotId={params.chatbotId}
          folderId={search.folderId}
        />
      </div>
      <Suspense>
        <FlowsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
