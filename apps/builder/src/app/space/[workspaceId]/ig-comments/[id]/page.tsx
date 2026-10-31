import { notFound } from "next/navigation"
import { EditIgCommentForm } from "@/features/ig-comments/components/edit-ig-comment-form"
import { IgCommentPostsStoreProvider } from "@/features/ig-comments/provider/ig-comment-posts-store-context"
import { getIgComment } from "@/features/ig-comments/queries"
import type { IgCommentVariant } from "@/features/ig-comments/schema/action"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditIgCommentPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  let igComment: Awaited<ReturnType<typeof getIgComment>>
  try {
    igComment = await getIgComment(workspaceId, id)
  } catch {
    return notFound()
  }

  const variant = igComment.type as IgCommentVariant

  return (
    <IgCommentPostsStoreProvider
      autoInitialize={true}
      variant={variant}
      workspaceId={workspaceId}
    >
      <LockedEditorGuard
        resourceId={id}
        resourceKind="fbCommentAutomation"
        workspaceId={workspaceId}
      >
        <EditIgCommentForm initialData={igComment} workspaceId={workspaceId} />
      </LockedEditorGuard>
    </IgCommentPostsStoreProvider>
  )
}
