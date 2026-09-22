import { notFound } from "next/navigation"

import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { findWebhook } from "@/features/webhooks/queries"
import UpdateWebhookForm from "@/features/webhooks/update-webhook-form"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

export default async function UpdateWebhookPage({
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
  const webhook = await findWebhook({ workspaceId, id })
  if (!webhook) {
    return notFound()
  }

  return (
    <FlowStoreProvider>
      <UpdateWebhookForm webhook={webhook} workspaceId={workspaceId} />
    </FlowStoreProvider>
  )
}
