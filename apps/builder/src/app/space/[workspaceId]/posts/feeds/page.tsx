import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { FeedsView } from "@/features/social-post-feeds/components/feeds-view"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"

export default async function PostFeedsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { readOnly } = await resolvePostsPageContext(workspaceId)

  return <FeedsView readOnly={readOnly} workspaceId={workspaceId} />
}
