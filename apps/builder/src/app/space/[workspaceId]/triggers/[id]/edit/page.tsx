import { ecommerceSettingsService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { LockedEditorGuard } from "@/features/templates/components/locked-editor-guard"

import { findTrigger } from "@/features/triggers/queries"
import UpdateTriggerForm from "@/features/triggers/update-trigger-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function UpdateTriggerPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const { workspaceId, id } = data
  await requireWorkspacePermission(workspaceId, "superAdmin")
  const trigger = await findTrigger({ workspaceId, id })
  if (!trigger) {
    return notFound()
  }

  const storeSource = await ecommerceSettingsService.storeSource(workspaceId)

  return (
    <LockedEditorGuard
      resourceId={id}
      resourceKind="trigger"
      workspaceId={workspaceId}
    >
      <UpdateTriggerForm
        storeSource={storeSource}
        trigger={trigger}
        workspaceId={workspaceId}
      />
    </LockedEditorGuard>
  )
}
