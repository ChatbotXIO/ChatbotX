import { parseBigIntId } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { CreateSequenceForm } from "@/features/sequences/create-sequence-form"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export default async function CreateSequencePage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<{ folderId: string | null }>
}) {
  const { data } = withWorkspaceIdSchema.safeParse(await props.params)
  if (!data) {
    return notFound()
  }
  const searchParams = await props.searchParams
  const folderId = parseBigIntId(searchParams.folderId)

  return (
    <CreateSequenceForm
      defaultFolderId={folderId}
      workspaceId={data.workspaceId}
    />
  )
}
