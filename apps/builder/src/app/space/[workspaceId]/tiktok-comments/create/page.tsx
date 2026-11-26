import { notFound } from "next/navigation"
import { CreateTiktokCommentForm } from "@/features/tiktok-comments/components/create-tiktok-comment-form"
import { listTiktokInboxIdsWithoutCaptionAccess } from "@/features/tiktok-comments/queries"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateTiktokCommentPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const captionUnavailableInboxIds =
    await listTiktokInboxIdsWithoutCaptionAccess(data.workspaceId)

  return (
    <CreateTiktokCommentForm
      captionUnavailableInboxIds={captionUnavailableInboxIds}
      workspaceId={data.workspaceId}
    />
  )
}
