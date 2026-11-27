import { ecommerceSettingsService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"

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

  const storeSource = await ecommerceSettingsService.storeSource(workspaceId)

  return (
    <UpdateWebhookForm
      storeSource={storeSource}
      webhook={webhook}
      workspaceId={workspaceId}
    />
  )
}
