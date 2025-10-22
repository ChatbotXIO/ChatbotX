import { type FolderModel, FolderType } from "@aha.chat/database/types"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { CreateFolderDialog } from "@/features/folders/create-folder-dialog"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schemas/list-folders-schema"

export default async function FoldersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = listFoldersSearchParams.parse(searchParams)

  const folderType = FolderType.tag

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
        <h3 className="flex-1 font-bold">{t("tags.heading.title")}</h3>
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
