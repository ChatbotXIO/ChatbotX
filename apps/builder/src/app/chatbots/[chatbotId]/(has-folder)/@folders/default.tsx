import { CreateFolderDialog } from "@/features/folders/create-folder-dialog"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { T } from "@/tolgee/server"
import { type Folder, FolderType } from "@ahachat.ai/database"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { createLoader, parseAsString, type SearchParams } from "nuqs/server"
import { Suspense } from "react"

const folderSearchParams = {
  folderId: parseAsString.withDefault(""),
}
const loadSearchParams = createLoader(folderSearchParams)

export default async function FoldersDetault(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const headersList = await headers()
  const url = new URL(headersList.get("x-url") as string)
  const featureName = url.pathname.split("/").pop()

  let folderType: FolderType | null = null
  switch (featureName) {
    case "automated-responses":
      folderType = FolderType.AUTOMATED_RESPONSE
      break
    case "flows":
      folderType = FolderType.FLOW
      break
    case "account-fields":
    case "custom-fields":
      folderType = FolderType.CUSTOM_FIELD
      break
    case "email-campaigns":
      folderType = FolderType.EMAIL_CAMPAIGN
      break
    case "tags":
      folderType = FolderType.TAG
      break
    default:
      break
  }
  if (!folderType) {
    return notFound()
  }

  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = await loadSearchParams(searchParams)

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
      folderId: folderId,
    }),
  ])

  return (
    <>
      <div className="flex">
        <h3 className="font-bold flex-1 text-xl">
          <T keyName="folders.heading" />
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
