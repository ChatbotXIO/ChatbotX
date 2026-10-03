import { notFound } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { CreateFbCommentForm } from "@/features/fb-comments/components/create-fb-comment-form"
import { FbCommentPostsStoreProvider } from "@/features/fb-comments/provider/fb-comment-posts-store-context"
import { isLivePostTypeParam } from "@/features/shared/comment-automation/lib/live-post-type"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateFbCommentPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { postType } = await props.searchParams
  const isLive = isLivePostTypeParam(postType)

  return (
    // A Live automation has no post picker, so its posts are never fetched.
    <FbCommentPostsStoreProvider
      autoInitialize={!isLive}
      workspaceId={data.workspaceId}
    >
      <CreateFbCommentForm isLive={isLive} workspaceId={data.workspaceId} />
    </FbCommentPostsStoreProvider>
  )
}
