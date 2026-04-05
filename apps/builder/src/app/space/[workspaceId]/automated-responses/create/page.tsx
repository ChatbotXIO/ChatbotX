import { notFound } from "next/navigation"
import { CreateAutomatedResponseForm } from "@/features/automated-response/create-automated-response-form"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateAutomatedResponePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { folderId } = await searchParams

  return (
    <CreateAutomatedResponseForm
      folderId={folderId}
      workspaceId={data.workspaceId}
    />
  )
}
