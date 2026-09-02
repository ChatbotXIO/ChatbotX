import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import SharedFolderSlot from "@/features/folders/shared-folder-slot"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function FolderPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = await withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }
  await requireWorkspacePermission(data.workspaceId, "superAdmin")

  return (
    <SharedFolderSlot
      searchParams={props.searchParams}
      workspaceId={data.workspaceId}
    />
  )
}
