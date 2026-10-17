import { folderTypes, rootFolderId } from "@chatbotx.io/database/partials"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { EmailTopicsTable } from "@/features/email-topics/email-topics-table"
import { listEmailTopicsRSC } from "@/features/email-topics/queries"
import { listEmailTopicsSearchParamsCache } from "@/features/email-topics/schema/query"
import { WithFolderBar } from "@/features/folders/with-folder-bar"

export default async function EmailTopicsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = await listEmailTopicsSearchParamsCache.parse(searchParams)
  const folderId = search.folderId ?? rootFolderId

  const promises = Promise.all([
    listEmailTopicsRSC({
      ...search,
      folderId,
      workspaceId,
    }),
  ])

  return (
    <WithFolderBar
      folderType={folderTypes.enum.emailTopic}
      searchParams={props.searchParams}
      workspaceId={workspaceId}
    >
      <Suspense>
        <EmailTopicsTable
          folderId={folderId}
          promises={promises}
          workspaceId={workspaceId}
        />
      </Suspense>
    </WithFolderBar>
  )
}
