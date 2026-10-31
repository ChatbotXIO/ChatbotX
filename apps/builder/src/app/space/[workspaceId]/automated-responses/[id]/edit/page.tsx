import { notFound } from "next/navigation"
import EditAutomatedResponseForm from "@/features/automated-response/edit-automated-response-form"
import { findAutomatedResponse } from "@/features/automated-response/queries"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"

export default async function EditAutomatedResponePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  const automatedResponse = await findAutomatedResponse({
    workspaceId,
    id,
    type: "inbound",
  })
  if (!automatedResponse) {
    return notFound()
  }

  return (
    <LockedEditorGuard
      resourceId={id}
      resourceKind="automatedResponse"
      workspaceId={workspaceId}
    >
      <EditAutomatedResponseForm
        automatedResponse={automatedResponse}
        type="inbound"
        workspaceId={workspaceId}
      />
    </LockedEditorGuard>
  )
}
