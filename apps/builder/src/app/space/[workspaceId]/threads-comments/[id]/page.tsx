import { notFound } from "next/navigation"
import { EditThreadsCommentForm } from "@/features/threads-comments/components/edit-threads-comment-form"
import { getThreadsComment } from "@/features/threads-comments/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditThreadsCommentPage(props: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  const record = await getThreadsComment(data.workspaceId, data.id).catch(
    () => null,
  )
  if (!record) {
    return notFound()
  }

  return (
    <EditThreadsCommentForm
      initialData={record}
      workspaceId={data.workspaceId}
    />
  )
}
