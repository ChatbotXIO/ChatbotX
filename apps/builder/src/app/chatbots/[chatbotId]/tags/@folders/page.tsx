import { type FolderModel, FolderType } from "@aha.chat/database/types"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateFolderDialog } from "@/features/folders/create-folder-dialog"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"
import { T } from "@/tolgee/server"

export default async function FoldersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = listFoldersSearchParams.parse(searchParams)

  const folderType = FolderType.TAG

  const promises = Promise.all([
    folderId
      ? getCurrentFolder({
          id: folderId,
          chatbotId: params.chatbotId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    getFolders({
      chatbotId: params.chatbotId,
      folderType,
      folderId,
    }),
  ])

  return (
    <>
      <div className="flex">
        <h3 className="flex-1 font-bold">
          <T keyName="tags.header" />
        </h3>
        <CreateFolderDialog
          chatbotId={params.chatbotId}
          folderType={folderType}
          parentId={folderId}
        />
      </div>

      <Suspense>
        <ListFolders
          chatbotId={params.chatbotId}
          folderType={folderType}
          promises={promises}
        />
      </Suspense>
    </>
  )
}
