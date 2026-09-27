import { notFound } from "next/navigation"
import { CreateTiktokCommentForm } from "@/features/tiktok-comments/components/create-tiktok-comment-form"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateTiktokCommentPage(props: {
  params: Promise<{ workspaceId: string }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }

  return <CreateTiktokCommentForm workspaceId={data.workspaceId} />
}
