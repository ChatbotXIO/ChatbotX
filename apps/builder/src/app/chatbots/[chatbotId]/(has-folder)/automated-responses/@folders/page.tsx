import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import SharedFolderSlot from "@/features/folders/shared-folder-slot"

export default async function FolderPage(props: {
  params: Promise<{ chatbotIdString: string }>
  searchParams: Promise<SearchParams>
}) {
  const { chatbotIdString } = await props.params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  return (
    <SharedFolderSlot chatbotId={chatbotId} searchParams={props.searchParams} />
  )
}
