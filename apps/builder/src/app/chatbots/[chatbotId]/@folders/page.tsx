import type { FolderModel } from "@chatbotx.io/database/types"
import { getIdFromParams } from "@chatbotx.io/utils"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createLoader, type SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ListFolders } from "@/features/folders/list-folders"
import { FolderStoreProvider } from "@/features/folders/provider/folder-store-context"
import { getCurrentFolder, listFolders } from "@/features/folders/queries"
import { parseAsBigInt } from "@/lib/nuqs"
import { getFolderTypeFromFeature } from "./_lib"

const folderSearchParams = {
  folderId: parseAsBigInt.withDefault(BigInt(0)),
}
const loadSearchParams = createLoader(folderSearchParams)

export default async function FoldersDetault(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const headersList = await headers()
  const url = new URL(headersList.get("x-url") as string)
  const featureName = url.pathname.split("/").pop()

  const folderType = getFolderTypeFromFeature(featureName)
  if (!folderType) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const { folderId } = await loadSearchParams(searchParams)
  const t = await getTranslations()

  const promises = Promise.all([
    folderId
      ? getCurrentFolder({
          id: folderId,
          chatbotId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    listFolders({
      chatbotId,
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
        <FolderStoreProvider chatbotId={chatbotId} folderType={folderType}>
          <ListFolders
            chatbotId={chatbotId}
            folderType={folderType}
            promises={promises}
          />
        </FolderStoreProvider>
      </Suspense>
    </>
  )
}
