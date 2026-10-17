import type { FolderType } from "@chatbotx.io/database/partials"
import type { SearchParams } from "nuqs/server"
import type { ReactNode } from "react"
import { FolderBarSlotProvider } from "./folder-bar-slot"
import SharedFolderSlot from "./shared-folder-slot"

// For pages whose card is rendered by a client table component: the table
// places the bar with `<FolderBarSlot />`. Pages that render the card
// themselves put `<SharedFolderSlot />` straight into it instead.
export function WithFolderBar(props: {
  folderType: FolderType
  workspaceId: string
  searchParams: Promise<SearchParams>
  children: ReactNode
}) {
  const { children, ...slotProps } = props

  return (
    <FolderBarSlotProvider slot={<SharedFolderSlot {...slotProps} />}>
      {children}
    </FolderBarSlotProvider>
  )
}
