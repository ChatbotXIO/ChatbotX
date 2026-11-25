import { getIdFromParams, isNumericId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ComposerView } from "@/features/social-posts/components/composer-view"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"

export default async function EditPostPage(props: {
  params: Promise<{ socialPostId: string; workspaceId: string }>
}) {
  const params = await props.params
  const workspaceId = getIdFromParams(params, "workspaceId")
  const socialPostId = getIdFromParams(params, "socialPostId")
  if (!(workspaceId && socialPostId && isNumericId(socialPostId))) {
    return notFound()
  }

  const { readOnly } = await resolvePostsPageContext(workspaceId)

  return (
    <ComposerView
      readOnly={readOnly}
      socialPostId={socialPostId}
      workspaceId={workspaceId}
    />
  )
}
