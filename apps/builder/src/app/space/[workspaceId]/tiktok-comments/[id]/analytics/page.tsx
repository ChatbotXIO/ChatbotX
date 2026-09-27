import { notFound } from "next/navigation"
import { CommentAutomationAnalyticsClient } from "@/features/shared/comment-automation/comment-automation-analytics-client"
import { getTiktokComment } from "@/features/tiktok-comments/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function TiktokCommentAnalyticsPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  // `getTiktokComment` scopes to the caller's workspace and to the `tiktok`
  // automation type, so an id belonging to another workspace — or to a
  // Facebook automation in this one — resolves to a 404 rather than an
  // analytics page for someone else's row.
  const record = await getTiktokComment(data.workspaceId, data.id).catch(
    () => null,
  )
  if (!record) {
    return notFound()
  }

  return (
    <div className="container mx-auto flex flex-col gap-6 py-6">
      <CommentAutomationAnalyticsClient
        automationId={data.id}
        automationName={record.name}
        workspaceId={data.workspaceId}
      />
    </div>
  )
}
