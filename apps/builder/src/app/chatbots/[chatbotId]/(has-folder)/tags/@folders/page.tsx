import type { SearchParams } from "nuqs/server"
import SharedFolderSlot from "@/features/folders/shared-folder-slot"

export default async function FolderPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const params = await props.params

  return (
    <SharedFolderSlot
      chatbotId={params.chatbotId}
      searchParams={props.searchParams}
    />
  )
}
