import { notFound } from "next/navigation"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"
import { EditTiktokCommentForm } from "@/features/tiktok-comments/components/edit-tiktok-comment-form"
import { getTiktokComment } from "@/features/tiktok-comments/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditTiktokCommentPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const record = await getTiktokComment(data.workspaceId, data.id).catch(
    () => null,
  )
  if (!record) {
    return notFound()
  }

  return (
    <LockedEditorGuard
      resourceId={data.id}
      resourceKind="fbCommentAutomation"
      workspaceId={data.workspaceId}
    >
      <EditTiktokCommentForm
        initialData={record}
        workspaceId={data.workspaceId}
      />
    </LockedEditorGuard>
  )
}
