import type { FolderModel } from "@aha.chat/database/types"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createLoader, parseAsString, type SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ListFolders } from "@/features/folders/list-folders"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { getFolderTypeFromFeature } from "./_lib"

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

  const folderType = getFolderTypeFromFeature(featureName)
  if (!folderType) {
    return notFound()
  }

  const params = await props.params
  const searchParams = await props.searchParams
  const { folderId } = await loadSearchParams(searchParams)
  const t = await getTranslations()

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
        <h3 className="flex-1 font-bold text-xl">
          {t("folders.heading.title")}
        </h3>
      </div>

      <Suspense>
        <FolderStoreProvider
          chatbotId={params.chatbotId}
          folderType={folderType}
        >
          <ListFolders
            chatbotId={params.chatbotId}
            folderType={folderType}
            promises={promises}
          />
        </FolderStoreProvider>
      </Suspense>
    </>
  )
}
