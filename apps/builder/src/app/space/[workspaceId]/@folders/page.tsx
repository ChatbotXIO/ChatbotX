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
  folderId: parseAsBigInt.withDefault(""),
}
const loadSearchParams = createLoader(folderSearchParams)

export default async function FoldersDetault(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
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
          workspaceId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    listFolders({
      workspaceId,
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
        <FolderStoreProvider folderType={folderType} workspaceId={workspaceId}>
          <ListFolders
            folderType={folderType}
            promises={promises}
            workspaceId={workspaceId}
          />
        </FolderStoreProvider>
      </Suspense>
    </>
  )
}
