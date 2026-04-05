import { type FolderType, folderTypes } from "@chatbotx.io/database/partials"
import type { FolderModel } from "@chatbotx.io/database/types"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import { headers } from "next/headers"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { ListFolders } from "@/features/folders/list-folders"
import { getCurrentFolder, listFolders } from "@/features/folders/queries"
import { listFoldersSearchParams } from "@/features/folders/schema/query"

export default async function SharedFolderSlot(props: {
  workspaceId: string
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
      folderType = folderTypes.enum.automatedResponse
      break
    case "sequences":
      folderType = folderTypes.enum.sequence
      break
    case "flows":
      folderType = folderTypes.enum.flow
      break
    case "bot-fields":
    case "custom-fields":
      folderType = folderTypes.enum.customField
      break
    case "tags":
      folderType = folderTypes.enum.tag
      break
    case "triggers":
      folderType = folderTypes.enum.trigger
      break
    case "webhooks":
      folderType = folderTypes.enum.webhook
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
          workspaceId: props.workspaceId,
        })
      : Promise.resolve({ folder: null, parents: [] as FolderModel[] }),
    listFolders({
      workspaceId: props.workspaceId,
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
            folderType={folderType}
            promises={promises}
            workspaceId={props.workspaceId}
          />
        </Suspense>
      </CardContent>
    </Card>
  )
}
