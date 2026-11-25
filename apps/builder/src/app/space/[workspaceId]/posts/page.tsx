import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { PostsView } from "@/features/channel-posts/components/posts-view"
import { canViewContactEmailAndPhone } from "@/features/contacts/permissions"
import { resolvePostsPageContext } from "@/features/social-posts/lib/posts-page-context"

export default async function PostsPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const { permissions, readOnly } = await resolvePostsPageContext(workspaceId)

  return (
    <PostsView
      canViewPhones={canViewContactEmailAndPhone(permissions)}
      readOnly={readOnly}
      workspaceId={workspaceId}
    />
  )
}
