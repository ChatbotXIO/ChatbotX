import { FolderType } from "@aha.chat/database/enums"
import type { FolderModel } from "@aha.chat/database/types"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@aha.chat/ui/components/ui/card"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, getFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schemas/query"

export default async function SharedFolderSlot(props: {
  chatbotId: string
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const headersList = await headers()
  const url = new URL(
    (headersList.get("x-url") ?? "https://google.com") as string,
  )
  const featureName = url.pathname.split("/").pop()

  let folderType: FolderType | null = null
  switch (featureName) {
    case "automated-responses":
      folderType = "automatedResponse"
      break
    case "sequences":
      folderType = FolderType.sequence
      break
    case "flows":
      folderType = "flow"
      break
    case "bot-fields":
    case "custom-fields":
      folderType = "customField"
      break
    case "tags":
      folderType = "tag"
      break
    default:
      break
  }
  if (!folderType) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const { folderId } = await listFoldersSearchParams.parse(searchParams)

  const promises = Promise.all([
    folderId
      ? getCurrentFolder({
          id: folderId,
          chatbotId: props.chatbotId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    getFolders({
      chatbotId: props.chatbotId,
      folderType,
      folderId,
    }),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-bold text-xl">
          {t("folders.heading.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Suspense>
          <ListFolders
            chatbotId={props.chatbotId}
            folderType={folderType}
            promises={promises}
          />
        </Suspense>
      </CardContent>
    </Card>
  )
}
