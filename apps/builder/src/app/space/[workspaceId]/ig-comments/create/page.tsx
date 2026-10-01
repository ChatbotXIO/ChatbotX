import { notFound, redirect } from "next/navigation"
import type { SearchParams } from "nuqs/server"
import { CreateIgCommentForm } from "@/features/ig-comments/components/create-ig-comment-form"
import { IgCommentPostsStoreProvider } from "@/features/ig-comments/provider/ig-comment-posts-store-context"
import { igCommentVariants } from "@/features/ig-comments/schema/action"
import { isLivePostTypeParam } from "@/features/shared/comment-automation/lib/live-post-type"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateIgCommentPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const { variant: rawVariant, postType } = await props.searchParams
  const isLive = isLivePostTypeParam(postType)
  const { data: variant } = igCommentVariants.safeParse(rawVariant)
  if (!variant) {
    redirect(`/space/${data.workspaceId}/ig-comments`)
  }

  return (
    // A Live automation has no post picker, so its media is never fetched.
    <IgCommentPostsStoreProvider
      autoInitialize={!isLive}
      variant={variant}
      workspaceId={data.workspaceId}
    >
      <CreateIgCommentForm
        isLive={isLive}
        variant={variant}
        workspaceId={data.workspaceId}
      />
    </IgCommentPostsStoreProvider>
  )
}
