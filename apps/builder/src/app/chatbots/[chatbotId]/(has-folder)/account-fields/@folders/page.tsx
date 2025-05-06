import SharedFolderSlot from "@/features/folders/shared-folder-slot"
import type { SearchParams } from "nuqs/server"

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
