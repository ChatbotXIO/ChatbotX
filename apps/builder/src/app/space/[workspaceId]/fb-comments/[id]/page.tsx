import { notFound, redirect } from "next/navigation"
import { EditFbCommentForm } from "@/features/fb-comments/components/edit-fb-comment-form"
import { FbCommentPostsStoreProvider } from "@/features/fb-comments/provider/fb-comment-posts-store-context"
import { getFbComment } from "@/features/fb-comments/queries"
import { getIgComment } from "@/features/ig-comments/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditFbCommentPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  let fbComment: Awaited<ReturnType<typeof getFbComment>>
  try {
    fbComment = await getFbComment(workspaceId, id)
  } catch {
    // Might be a pre-split Instagram automation whose old fb-comments URL is
    // still bookmarked/linked — redirect instead of a bare 404.
    try {
      await getIgComment(workspaceId, id)
    } catch {
      return notFound()
    }
    redirect(`/space/${workspaceId}/ig-comments/${id}`)
  }

  return (
    <FbCommentPostsStoreProvider
      autoInitialize={true}
      workspaceId={workspaceId}
    >
      <EditFbCommentForm initialData={fbComment} workspaceId={workspaceId} />
    </FbCommentPostsStoreProvider>
  )
}
