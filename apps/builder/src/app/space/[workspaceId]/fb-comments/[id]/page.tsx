import { notFound } from "next/navigation"
import { EditFbCommentForm } from "@/features/fb-comments/components/edit-fb-comment-form"
import { FbCommentPostsStoreProvider } from "@/features/fb-comments/provider/fb-comment-posts-store-context"
import { getFbComment } from "@/features/fb-comments/queries"
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
    return notFound()
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
