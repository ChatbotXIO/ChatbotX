import { notFound } from "next/navigation"
import { CreateFbCommentForm } from "@/features/fb-comments/components/create-fb-comment-form"
import { FbCommentPostsStoreProvider } from "@/features/fb-comments/provider/fb-comment-posts-store-context"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateFbCommentPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  return (
    <FbCommentPostsStoreProvider
      autoInitialize={true}
      workspaceId={data.workspaceId}
    >
      <CreateFbCommentForm workspaceId={data.workspaceId} />
    </FbCommentPostsStoreProvider>
  )
}
