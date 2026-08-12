import { notFound } from "next/navigation"
import { CreateThreadsCommentForm } from "@/features/threads-comments/components/create-threads-comment-form"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateThreadsCommentPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  return <CreateThreadsCommentForm workspaceId={data.workspaceId} />
}
