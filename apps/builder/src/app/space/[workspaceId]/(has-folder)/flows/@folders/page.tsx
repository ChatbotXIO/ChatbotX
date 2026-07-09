import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import SharedFolderSlot from "@/features/folders/shared-folder-slot"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function FolderPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireWorkspacePermission(workspaceId, "flows")

  return (
    <SharedFolderSlot
      searchParams={props.searchParams}
      workspaceId={workspaceId}
    />
  )
}
