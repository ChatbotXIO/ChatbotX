import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { ComposerView } from "@/features/social-posts/components/composer-view"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"

export default async function CreatePostPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { readOnly } = await resolvePostsPageContext(workspaceId)

  return <ComposerView readOnly={readOnly} workspaceId={workspaceId} />
}
