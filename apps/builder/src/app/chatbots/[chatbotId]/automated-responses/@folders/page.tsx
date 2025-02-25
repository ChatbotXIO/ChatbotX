import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { getFoldersSearchParamsCache } from "@/features/folders/schemas/get-folders-schema"
import { T } from "@/tolgee/server"
import { type Folder, FolderType } from "@ahachat.ai/database"
import Link from "next/link"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"

export default async function FoldersPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = getFoldersSearchParamsCache.parse(searchParams)

  const folderType = FolderType.AutomatedResponse

  const promises = Promise.all([
    folderId
      ? getCurrentFolder({
          id: folderId,
          chatbotId: params.chatbotId,
        })
      : Promise.resolve({ folder: null, parents: [] as Folder[] }),
    getFolders({
      chatbotId: params.chatbotId,
      folderType: folderType,
      parentId: folderId,
    }),
  ])

  return (
    <>
      <div className="flex">
        <h3 className="font-bold flex-1">
          <T keyName="automatedResponse.header" />
        </h3>
        <Link
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2"
          href={`/chatbots/${params.chatbotId}/automated-responses/new`}
        >
          Add
        </Link>
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
