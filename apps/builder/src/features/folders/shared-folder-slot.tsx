import { type FolderType, rootFolderId } from "@chatbotx.io/database/partials"
import type { FolderModel } from "@chatbotx.io/database/types"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, listFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schema/query"

export default async function SharedFolderSlot(props: {
  folderType: FolderType
  workspaceId: string
  searchParams: Promise<SearchParams>
}) {
  const { folderType, workspaceId } = props
  const searchParams = await props.searchParams
  const { folderId } = await listFoldersSearchParams.parse(searchParams)

  const promises = Promise.all([
    folderId
      ? getCurrentFolder({ id: folderId, workspaceId })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    listFolders({
      workspaceId,
      folderType,
      folderId: folderId ?? rootFolderId,
    }),
  ])

  return (
    <Suspense fallback={<Skeleton className="mb-4 h-8 w-full" />}>
      <ListFolders
        folderType={folderType}
        // Remount per folder so per-level UI state (show more) starts collapsed.
        key={folderId ?? rootFolderId}
        promises={promises}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}
