import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import SharedFolderSlot from "@/features/folders/shared-folder-slot"

export default async function FolderPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const chatbotId = getIdFromParams(await props.params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  return (
    <SharedFolderSlot chatbotId={chatbotId} searchParams={props.searchParams} />
  )
}
